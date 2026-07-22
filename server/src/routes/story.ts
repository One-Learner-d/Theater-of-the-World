// ============================================================
// 多智能体剧场路由 - 角色思考+场景演绎
// ============================================================

import { Router, Response } from 'express'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { callLLM, buildAgentThinkingPrompt, buildSceneCompilationPrompt, buildNovelChapterPrompt, buildSummaryPrompt } from '../services/llm'

const router = Router()
router.use(authMiddleware)

// ============================================================
// JSON清理工具 - 修复LLM输出中的常见JSON格式问题
// ============================================================

/** 解析角色思考结果（中文键值对格式） */
function parseThoughtResult(text: string): { internal_thought: string; action_desc: string; dialogue: string; target_character: string | null; emotional_state: string } {
  if (!text || typeof text !== 'string') {
    throw new Error('LLM返回内容为空')
  }

  const result = {
    internal_thought: '',
    action_desc: '',
    dialogue: '',
    target_character: null as string | null,
    emotional_state: '平静',
  }

  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('内心想法') || trimmed.startsWith('内心')) {
      const val = trimmed.replace(/^(内心想法|内心)[：:]\s*/, '').trim()
      if (val) result.internal_thought = val
    } else if (trimmed.startsWith('动作') || trimmed.startsWith('打算')) {
      const val = trimmed.replace(/^(动作|打算做的动作|打算)[：:]\s*/, '').trim()
      if (val && val !== '无') result.action_desc = val
    } else if (trimmed.startsWith('对话') || trimmed.startsWith('说的话')) {
      const val = trimmed.replace(/^(对话|说的话|打算说的话)[：:]\s*/, '').trim()
      if (val && val !== '无') result.dialogue = val
    } else if (trimmed.startsWith('目标') || trimmed.startsWith('互动目标')) {
      const val = trimmed.replace(/^(目标|互动目标)[：:]\s*/, '').trim()
      if (val && val !== '无' && val !== 'null' && val !== 'none') result.target_character = val
    } else if (trimmed.startsWith('情绪') || trimmed.startsWith('情感')) {
      const val = trimmed.replace(/^(情绪|情感)[：:]\s*/, '').trim()
      if (val) result.emotional_state = val
    }
  }

  return result
}

/** 清理并尝试解析LLM返回的JSON（仅用于Phase 2场景编排） */
function cleanAndParseJSON(text: string): any {
  if (!text || typeof text !== 'string') throw new Error('LLM返回内容为空')

  // 1. 直接尝试
  try { return JSON.parse(text.trim()) } catch {}

  // 2. 提取代码块 + 修复
  let s = text.trim()
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  // 提取 {}/[]
  const firstBrace = s.indexOf('[')
  const lastBrace = s.lastIndexOf(']')
  const firstObj = s.indexOf('{')
  const lastObj = s.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    s = s.substring(firstBrace, lastBrace + 1)
  } else if (firstObj >= 0 && lastObj > firstObj) {
    s = s.substring(firstObj, lastObj + 1)
  }
  // 修复
  s = s.replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')
  s = s.replace(/(\{|\,)\s*([a-zA-Z_一-鿿][\w一-鿿]*)\s*:/g, '$1"$2":')

  try { return JSON.parse(s) } catch {}

  // 3. 懒匹配单个对象兜底
  const single = s.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/)
  if (single) {
    try { return JSON.parse(single[0]) } catch {}
  }

  throw new Error('无法提取JSON')
}

/** 截断上下文到合理长度（保留最近的内容） */
function truncateContext(context: string, maxLen: number = 1500): string {
  if (context.length <= maxLen) return context
  const prefix = '...(前面剧情已省略)...\n'
  return prefix + context.slice(-maxLen)
}

// ============================================================
// POST /api/story/agent-turn - 多智能体剧场：角色思考+场景演绎
// ============================================================

let globalTurnCounter = 0

router.post('/agent-turn', async (req: AuthRequest, res: Response) => {
  try {
    const { theater_id, story_summary, recent_context, user_intervention } = req.body

    // 加载剧场配置
    const theater = db.prepare(
      'SELECT * FROM theaters WHERE id = ? AND user_id = ?'
    ).get(theater_id, req.userId) as any
    if (!theater) {
      return res.status(404).json({ success: false, message: '剧场不存在' })
    }

    const charIds = JSON.parse(theater.character_ids || '[]')
    const characters = charIds.length > 0
      ? db.prepare(`SELECT * FROM characters WHERE id IN (${charIds.map(() => '?').join(',')})`).all(...charIds)
      : []
    if (characters.length === 0) {
      return res.status(400).json({ success: false, message: '剧场没有角色，请先添加角色' })
    }

    const relIds = JSON.parse(theater.relationship_ids || '[]')
    const relationships = relIds.length > 0
      ? db.prepare(
          `SELECT r.*, ca.name as character_a_name, cb.name as character_b_name
           FROM relationships r
           LEFT JOIN characters ca ON r.character_a_id = ca.id
           LEFT JOIN characters cb ON r.character_b_id = cb.id
           WHERE r.id IN (${relIds.map(() => '?').join(',')})`
        ).all(...relIds)
      : []

    const scene = theater.scene_id
      ? db.prepare('SELECT * FROM scenes WHERE id = ?').get(theater.scene_id)
      : null

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any
    if (!user.api_key) {
      return res.status(400).json({
        success: false,
        message: '请先配置大模型API密钥',
      })
    }

    const llmConfig = {
      api_key: user.api_key,
      api_base_url: user.api_base_url || '',
      api_model: user.api_model || 'gpt-3.5-turbo',
    }

    // ============================================================
    // Phase 1: 并行角色思考（单个角色失败不阻塞整体）
    // ============================================================
    // 截断上下文，避免太长导致LLM困惑
    const contextForThinking = truncateContext(recent_context || story_summary || '故事刚刚开始。')

    // 分批并发：每批最多3个角色
    const BATCH_SIZE = 3
    const allThoughts: any[] = []

    for (let i = 0; i < characters.length; i += BATCH_SIZE) {
      const batch = characters.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(batch.map(async (character: any) => {
        const { systemPrompt, userPrompt } = buildAgentThinkingPrompt(
          character, relationships, contextForThinking, scene, characters, user_intervention
        )
        const result = await callLLM({
          ...llmConfig,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.75,
          max_tokens: 600,
        })

        const thought = parseThoughtResult(result)
        return {
          character_id: character.id,
          character_name: character.name,
          internal_thought: thought.internal_thought,
          action_desc: thought.action_desc,
          dialogue: thought.dialogue,
          target_character: thought.target_character,
          emotional_state: thought.emotional_state,
        }
      }))

      // 失败的字符用fallback代替，不阻塞整体
      batchResults.forEach((r: PromiseSettledResult<any>, idx: number) => {
        const character: any = batch[idx]
        if (r.status === 'fulfilled') {
          allThoughts.push(r.value)
        } else {
          console.warn(`[Agent] 角色「${character.name}」思考跳过: ${r.reason?.message || '未知错误'}`)
          allThoughts.push({
            character_id: character.id,
            character_name: character.name,
            internal_thought: '（不知道该如何反应）',
            action_desc: `保持安静，观察周围`,
            dialogue: '',
            target_character: null,
            emotional_state: '平静',
          })
        }
      })
    }

    // ============================================================
    // Phase 2: 场景编排
    // ============================================================
    const { systemPrompt: dirPrompt, userPrompt: dirUserPrompt } = buildSceneCompilationPrompt(
      allThoughts, scene, user_intervention, relationships, characters
    )

    let compiledActs: any[] = []
    try {
      const dirResult = await callLLM({
        ...llmConfig,
        messages: [
          { role: 'system', content: dirPrompt },
          { role: 'user', content: dirUserPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      })

      const parsed = cleanAndParseJSON(dirResult)
      compiledActs = Array.isArray(parsed) ? parsed : [parsed]
    } catch (err: any) {
      // 场景编排JSON解析失败时，用角色思考数据直接构建简易场景
      console.warn('[Agent] 场景编排回退到原始思考数据:', err.message)
      compiledActs = allThoughts.map((t: any) => ({
        character_name: t.character_name,
        action: t.action_desc || '站在原地',
        dialogue: t.dialogue || '',
        internal_thought: t.internal_thought || '',
        emotional_state: t.emotional_state || '平静',
      }))
    }

    // ============================================================
    // 后处理：确保所有角色都出现在场景中
    // ============================================================
    const appearedNames = new Set(compiledActs.map((a: any) => a.character_name))
    for (const thought of allThoughts) {
      if (!appearedNames.has(thought.character_name)) {
        compiledActs.push({
          character_name: thought.character_name,
          action: thought.action_desc || '站在原地',
          dialogue: thought.dialogue || '',
          internal_thought: thought.internal_thought || '',
          emotional_state: thought.emotional_state || '平静',
        })
      }
    }

    // ============================================================
    // 构建返回数据
    // ============================================================
    globalTurnCounter++

    // 构建用于导出的文本形式
    let sceneText = ''
    for (const act of compiledActs) {
      sceneText += `${act.character_name}（${act.emotional_state || ''}）`
      if (act.action) sceneText += `\n  （${act.action}）`
      if (act.dialogue) sceneText += `\n  「${act.dialogue}」`
      sceneText += '\n\n'
    }

    res.json({
      success: true,
      data: {
        turn_number: globalTurnCounter,
        scene: scene ? { time: (scene as any).time || '', location: (scene as any).location || '' } : { time: '', location: '' },
        acts: compiledActs,
        story_progress: sceneText,
      },
    })
  } catch (error: any) {
    console.error('[Agent] 演绎失败:', error)
    // 兜底返回
    res.json({
      success: true,
      data: {
        turn_number: ++globalTurnCounter,
        scene: { time: '', location: '' },
        acts: [{ character_name: '所有人', action: '故事仍在继续', dialogue: '', internal_thought: '……', emotional_state: '平静' }],
        story_progress: error.message || '剧场继续演绎',
      },
    })
  }
})

// ============================================================
// POST /api/story/novel-chapter - 小说体章节生成
// ============================================================

router.post('/novel-chapter', async (req: AuthRequest, res: Response) => {
  try {
    const { theater_id, story_so_far, user_intervention } = req.body

    // 加载剧场配置
    const theater = db.prepare(
      'SELECT * FROM theaters WHERE id = ? AND user_id = ?'
    ).get(theater_id, req.userId) as any
    if (!theater) {
      return res.status(404).json({ success: false, message: '剧场不存在' })
    }

    const charIds = JSON.parse(theater.character_ids || '[]')
    const characters = charIds.length > 0
      ? db.prepare(`SELECT * FROM characters WHERE id IN (${charIds.map(() => '?').join(',')})`).all(...charIds)
      : []
    if (characters.length === 0) {
      return res.status(400).json({ success: false, message: '剧场没有角色，请先添加角色' })
    }

    const relIds = JSON.parse(theater.relationship_ids || '[]')
    const relationships = relIds.length > 0
      ? db.prepare(
          `SELECT r.*, ca.name as character_a_name, cb.name as character_b_name
           FROM relationships r
           LEFT JOIN characters ca ON r.character_a_id = ca.id
           LEFT JOIN characters cb ON r.character_b_id = cb.id
           WHERE r.id IN (${relIds.map(() => '?').join(',')})`
        ).all(...relIds)
      : []

    const scene = theater.scene_id
      ? db.prepare('SELECT * FROM scenes WHERE id = ?').get(theater.scene_id)
      : null

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any
    if (!user.api_key) {
      return res.status(400).json({
        success: false,
        message: '请先配置大模型API密钥',
      })
    }

    const llmConfig = {
      api_key: user.api_key,
      api_base_url: user.api_base_url || '',
      api_model: user.api_model || 'gpt-3.5-turbo',
    }

    // 构建小说体提示词
    const { systemPrompt, userPrompt } = buildNovelChapterPrompt(
      characters, relationships, scene, story_so_far || '', user_intervention
    )

    // 调用LLM生成章节
    const chapterText = await callLLM({
      ...llmConfig,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 2000,
    })

    if (!chapterText.trim()) {
      throw new Error('生成的章节内容为空')
    }

    res.json({
      success: true,
      data: {
        chapter_title: `第 ${story_so_far ? '下一' : '一'} 章`,
        chapter_text: chapterText.trim(),
        story_progress: chapterText.trim(),
      },
    })
  } catch (error: any) {
    console.error('[Novel] 小说生成失败:', error)
    res.status(500).json({ success: false, message: error.message || '小说章节生成失败' })
  }
})

// ============================================================
// POST /api/story/summarize - 压缩剧情上下文
// ============================================================

router.post('/summarize', async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body
    if (!text || text.length < 50) {
      return res.json({ success: true, data: { summary: text || '' } })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any
    if (!user.api_key) {
      return res.status(400).json({ success: false, message: '请先配置大模型API密钥' })
    }

    const { systemPrompt, userPrompt } = buildSummaryPrompt(text)

    const summary = await callLLM({
      api_key: user.api_key,
      api_base_url: user.api_base_url || '',
      api_model: user.api_model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    })

    res.json({
      success: true,
      data: { summary: summary.trim() || text.slice(0, 300) },
    })
  } catch (error: any) {
    console.error('[Summarize] 摘要生成失败:', error)
    // 失败时返回原文截断，不阻塞流程
    res.json({ success: true, data: { summary: (req.body.text || '').slice(0, 300) } })
  }
})

export default router
