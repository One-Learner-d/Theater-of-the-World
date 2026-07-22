// ============================================================
// 剧场观察页面 - 支持小说体 / 多智能体两种演绎模式
// 每5次生成自动压缩上下文，避免剧情过长导致LLM质量下降
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { theaterApi, storyApi } from '../services/api'
import type { Theater, CharacterAct } from '../types'
import './StoryViewPage.css'

type StoryMode = 'novel' | 'agent'

const COMPRESS_INTERVAL = 5 // 每5次生成压缩一次上下文

export default function StoryViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // 剧场数据
  const [theater, setTheater] = useState<Theater | null>(null)
  const [storyProgress, setStoryProgress] = useState('')

  // 演绎模式（默认小说体）
  const [mode, setMode] = useState<StoryMode>('novel')
  const [modeConfirmed, setModeConfirmed] = useState(false)

  // 小说体数据
  const [novelChapters, setNovelChapters] = useState<string[]>([])

  // 多智能体数据
  const [agentScenes, setAgentScenes] = useState<{ acts: CharacterAct[] }[]>([])
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set())

  // 上下文压缩（分层摘要）
  const [storySummary, setStorySummary] = useState('')      // L1: 近期摘要（近5轮）
  const [deepSummary, setDeepSummary] = useState('')         // L2+: 深层摘要（压缩摘要的摘要）
  const genCountRef = useRef(0)                              // 生成计数
  const compressionCountRef = useRef(0)                      // L1压缩次数（用于触发L2压缩）
  const isCompressingRef = useRef(false)

  // 状态控制
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // 干预输入
  const [intervention, setIntervention] = useState('')

  // 存档命名弹窗
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveName, setSaveName] = useState('')

  // 滚动到底部
  const storyEndRef = useRef<HTMLDivElement>(null)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    storyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [novelChapters, agentScenes])

  /** 加载剧场数据 */
  useEffect(() => {
    if (!id) return
    const load = async () => {
      try {
        const res = await theaterApi.get(Number(id))
        if (res.success && res.data) {
          const t = res.data as Theater
          setTheater(t)
          setStoryProgress(t.story_progress || '')
          // 恢复分层摘要：格式"DEEP||xxx||RECENT||xxx"或旧版纯文本
          const raw = t.story_summary || ''
          const deepMatch = raw.match(/^DEEP\|\|([\s\S]*?)\|\|RECENT\|\|([\s\S]*)$/)
          if (deepMatch) {
            setDeepSummary(deepMatch[1].trim())
            setStorySummary(deepMatch[2].trim())
          } else {
            setStorySummary(raw)
          }
          if (t.story_history && t.story_history !== '[]') {
            try {
              const parsed = JSON.parse(t.story_history)
              if (Array.isArray(parsed) && parsed.length > 0) {
                if (typeof parsed[0] === 'object' && parsed[0] !== null && 'acts' in parsed[0]) {
                  setAgentScenes(parsed)
                  setMode('agent')
                } else if (typeof parsed[0] === 'string') {
                  setNovelChapters(parsed)
                  setMode('novel')
                }
                setModeConfirmed(true)
              }
            } catch {}
          }
        }
      } catch (err: any) {
        setError(err.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  /** 压缩当前剧情上下文（分层摘要：每5次L1压缩产生一次L2深层摘要） */
  const compressContext = async (fullText: string) => {
    if (isCompressingRef.current || fullText.length < 200) return
    isCompressingRef.current = true
    try {
      // L1: 从原始文本生成近期摘要
      const res = await storyApi.summarize({ text: fullText })
      if (res.success && res.data) {
        const newSummary = res.data.summary
        setStorySummary(newSummary)

        // 每累计5次L1压缩，压缩所有摘要为更上层的深层摘要
        compressionCountRef.current += 1
        if (compressionCountRef.current >= 5) {
          compressionCountRef.current = 0
          const deepText = deepSummary
            ? `【旧深层摘要】\n${deepSummary}\n\n【近5轮摘要】\n${newSummary}`
            : newSummary
          const deepRes = await storyApi.summarize({ text: deepText })
          if (deepRes.success && deepRes.data) {
            setDeepSummary(deepRes.data.summary)
          }
        }
      }
    } catch {
      // 压缩失败不影响主流程
    } finally {
      isCompressingRef.current = false
    }
  }

  /** 构建分层压缩后的上下文（深层摘要 + 近期摘要 + 最近一段） */
  const buildCompressedContext = (): string => {
    if (!storySummary) return storyProgress

    let lastSegment = ''
    if (mode === 'novel' && novelChapters.length > 0) {
      lastSegment = novelChapters[novelChapters.length - 1]
    } else if (mode === 'agent' && agentScenes.length > 0) {
      const lastScene = agentScenes[agentScenes.length - 1]
      lastSegment = lastScene.acts.map(a =>
        `${a.character_name}：${a.action ? '（' + a.action + '）' : ''}${a.dialogue ? '「' + a.dialogue + '」' : ''}`
      ).join('\n')
    }

    const parts: string[] = []
    if (deepSummary) parts.push(`【故事概要】\n${deepSummary}`)
    if (storySummary) parts.push(`【近期发展】\n${storySummary}`)
    if (lastSegment) parts.push(`【最近发生的事】\n${lastSegment}`)

    return parts.length > 0 ? parts.join('\n\n') : storyProgress
  }

  /** 小说体：生成下一章 */
  const handleNovelContinue = async (interventionText?: string) => {
    if (!id) return
    setGenerating(true)
    setError('')
    try {
      const context = buildCompressedContext()
      const res = await storyApi.novelChapter({
        theater_id: Number(id),
        story_so_far: context || undefined,
        user_intervention: interventionText || undefined,
      })
      if (res.success && res.data) {
        const data = res.data
        setNovelChapters(prev => [...prev, data.chapter_text])
        setStoryProgress(prev => prev ? prev + '\n\n---\n\n' + data.story_progress : data.story_progress)
        genCountRef.current += 1

        // 每5章压缩一次
        if (genCountRef.current >= COMPRESS_INTERVAL) {
          genCountRef.current = 0
          const newFull = storyProgress
            ? storyProgress + '\n\n---\n\n' + data.story_progress
            : data.story_progress
          compressContext(newFull)
        }
      }
    } catch (err: any) {
      setError(err.message || '生成失败')
      showToast(err.message || '小说章节生成失败', 'error')
    } finally {
      setGenerating(false)
      setIntervention('')
    }
  }

  /** 多智能体：继续演绎 */
  const handleAgentContinue = async (interventionText?: string) => {
    if (!id) return
    setGenerating(true)
    setError('')
    try {
      const context = buildCompressedContext()
      const res = await storyApi.agentTurn({
        theater_id: Number(id),
        story_summary: storySummary || theater?.story_summary || undefined,
        recent_context: context || undefined,
        user_intervention: interventionText || undefined,
      })
      if (res.success && res.data) {
        const data = res.data
        setAgentScenes(prev => [...prev, { acts: data.acts }])
        setStoryProgress(prev => prev ? prev + '\n\n---\n\n' + data.story_progress : data.story_progress)
        genCountRef.current += 1

        if (genCountRef.current >= COMPRESS_INTERVAL) {
          genCountRef.current = 0
          const newFull = storyProgress
            ? storyProgress + '\n\n---\n\n' + data.story_progress
            : data.story_progress
          compressContext(newFull)
        }
      }
    } catch (err: any) {
      setError(err.message || '演绎失败')
      showToast(err.message || '演绎失败', 'error')
    } finally {
      setGenerating(false)
      setIntervention('')
    }
  }

  const handleStart = () => {
    setModeConfirmed(true)
    if (mode === 'novel') {
      handleNovelContinue()
    } else {
      handleAgentContinue()
    }
  }

  const handleContinue = () => {
    if (mode === 'novel') {
      handleNovelContinue(intervention.trim() || undefined)
    } else {
      handleAgentContinue(intervention.trim() || undefined)
    }
  }

  const toggleThought = (thoughtKey: string) => {
    setExpandedThoughts(prev => {
      const next = new Set(prev)
      if (next.has(thoughtKey)) {
        next.delete(thoughtKey)
      } else {
        next.add(thoughtKey)
      }
      return next
    })
  }

  const openSaveDialog = () => {
    setSaveName(theater?.name || '未命名剧场')
    setShowSaveDialog(true)
  }

  const handleSave = async () => {
    if (!id) return
    try {
      let historyData: any
      if (novelChapters.length > 0) {
        historyData = JSON.stringify(novelChapters)
      } else if (agentScenes.length > 0) {
        historyData = JSON.stringify(agentScenes)
      } else {
        historyData = '[]'
      }

      // 保存分层摘要（兼容旧格式）
      const summaryPayload = deepSummary
        ? `DEEP||${deepSummary}||RECENT||${storySummary}`
        : storySummary
      await theaterApi.update(Number(id), {
        name: saveName || '未命名剧场',
        story_history: historyData,
        story_progress: storyProgress,
        story_summary: summaryPayload,
        current_perspective: 'god',
      })
      setShowSaveDialog(false)
      showToast('存档成功！', 'success')
      setTimeout(() => navigate('/theaters'), 600)
    } catch (err: any) {
      showToast(err.message || '存档失败', 'error')
    }
  }

  const togglePause = () => {
    if (paused) {
      handleContinue()
      setPaused(false)
    } else {
      setPaused(true)
    }
  }

  // ============================================================
  // 渲染
  // ============================================================

  const renderModeSelection = () => (
    <div className="mode-selector">
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'novel' ? 'active' : ''}`}
          onClick={() => setMode('novel')}
        >
          <span className="mode-tab-icon">📖</span>
          <span className="mode-tab-label">小说体</span>
          <span className="mode-tab-desc">叙事文学风格，流畅阅读</span>
        </button>
        <button
          className={`mode-tab ${mode === 'agent' ? 'active' : ''}`}
          onClick={() => setMode('agent')}
        >
          <span className="mode-tab-icon">🎬</span>
          <span className="mode-tab-label">多智能体</span>
          <span className="mode-tab-desc">角色自主思考，即兴演绎</span>
        </button>
      </div>
      <div className="story-empty">
        <div className="empty-icon">{mode === 'novel' ? '📖' : '🎬'}</div>
        <h2>准备好开始了吗？</h2>
        <p>{mode === 'novel' ? 'AI将为你撰写故事的第一个章节' : 'AI将为每个角色注入思维，开启即兴剧场'}</p>
        <button className="btn btn-primary start-btn" onClick={handleStart} disabled={generating}>
          {generating ? '生成中...' : (mode === 'novel' ? '开始创作' : '开始剧场')}
        </button>
      </div>
    </div>
  )

  const renderNovelContent = () => {
    if (novelChapters.length === 0) return null
    return (
      <div className="novel-content">
        {novelChapters.map((chapter, idx) => (
          <div key={idx} className="novel-chapter">
            <div className="novel-chapter-header">
              <h3 className="novel-chapter-title">第 {idx + 1} 章</h3>
              {idx === novelChapters.length - 1 && deepSummary && (
                <span className="compressed-badge">深层摘要</span>
              )}
            </div>
            <div className="novel-chapter-text">
              {chapter.split('\n').map((line, i) => (
                line.trim() ? <p key={i}>{line}</p> : <br key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderAgentContent = () => {
    if (agentScenes.length === 0) return null
    return (
      <div className="agent-scenes">
        {agentScenes.map((scene, sceneIdx) => (
          <div key={sceneIdx} className="agent-scene">
            {scene.acts.map((act, actIdx) => {
              const thoughtKey = `${sceneIdx}-${actIdx}`
              const isExpanded = expandedThoughts.has(thoughtKey)
              return (
                <div key={thoughtKey} className="character-act">
                  <div className="act-actor-name">
                    {act.character_name}
                    {act.emotional_state && <span className="act-emotion">{act.emotional_state}</span>}
                  </div>
                  {act.action && <div className="act-action">（{act.action}）</div>}
                  {act.dialogue && <div className="act-dialogue">「{act.dialogue}」</div>}
                  {act.internal_thought && (
                    <div className="act-thought">
                      <button className="thought-toggle" onClick={() => toggleThought(thoughtKey)}>
                        💬 内心想法 {isExpanded ? '▲' : '▼'}
                      </button>
                      {isExpanded && <div className="thought-content">{act.internal_thought}</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="story-page">
        <nav className="nav-bar">
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/theaters')}>← 返回</div>
        </nav>
        <div className="loading">加载剧场数据...</div>
      </div>
    )
  }

  if (error && !storyProgress && novelChapters.length === 0 && agentScenes.length === 0) {
    return (
      <div className="story-page">
        <nav className="nav-bar">
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/theaters')}>← 返回</div>
        </nav>
        <div className="story-error">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/theaters')}>返回剧场列表</button>
        </div>
      </div>
    )
  }

  const hasNovelContent = novelChapters.length > 0
  const hasAgentContent = agentScenes.length > 0
  const hasAnyContent = hasNovelContent || hasAgentContent || !!storyProgress

  return (
    <div className="story-page">
      <nav className="nav-bar">
        <div className="logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/theaters')}>← 返回</div>
        <span className="story-title">{theater?.name || '剧场观察'}</span>
        <span className="story-mode-badge">
          {mode === 'novel' ? '📖 小说体' : '🎬 多智能体'}
          {deepSummary ? ' • 深层摘要' : ''}
        </span>
      </nav>

      {toast && <div className={`toast toast-${toast.includes('失败') ? 'error' : 'success'}`}>{toast}</div>}

      <div className="story-body">
        {!modeConfirmed && renderModeSelection()}

        {modeConfirmed && (
          <>
            {generating && !hasAnyContent && (
              <div className="generating-indicator first-generating">
                <div className="dot-pulse"></div>
                <span>{mode === 'novel' ? 'AI正在创作第一章...' : '角色们正在思考...'}</span>
              </div>
            )}

            {!generating && !hasAnyContent && error && (
              <div className="story-error-inline" style={{ marginTop: 40 }}>
                <p>{error}</p>
                <button className="btn btn-primary" onClick={handleContinue}>重试</button>
              </div>
            )}

            {hasAnyContent && (
              <div className="story-content">
                {!hasNovelContent && !hasAgentContent && !!storyProgress && (
                  <div className="story-segment saved-content">
                    <div className="segment-text">
                      {storyProgress.split('\n').map((line, i) => (
                        <p key={i}>{line || ' '}</p>
                      ))}
                    </div>
                  </div>
                )}

                {mode === 'novel' && renderNovelContent()}
                {mode === 'agent' && renderAgentContent()}

                {generating && (
                  <div className="generating-indicator">
                    <div className="dot-pulse"></div>
                    <span>{mode === 'novel' ? 'AI正在创作下一章...' : '角色们正在思考...'}</span>
                  </div>
                )}

                {error && (
                  <div className="story-error-inline">
                    <p>{error}</p>
                    <button className="btn btn-secondary" onClick={handleContinue}>重试</button>
                  </div>
                )}

                <div ref={storyEndRef} />
              </div>
            )}

            {!generating && hasAnyContent && (
              <div className="story-controls">
                <div className="controls-row">
                  <button className="btn btn-secondary" onClick={openSaveDialog}>存档</button>
                  <button className="btn btn-primary" onClick={handleContinue}>继续</button>
                  <button className={`btn ${paused ? 'btn-primary' : 'btn-secondary'}`} onClick={togglePause}>
                    {paused ? '提交' : '干预'}
                  </button>
                </div>
                {paused && (
                  <div className="controls-intervention">
                    <textarea
                      placeholder={mode === 'novel'
                        ? '输入你想要的剧情方向，例如：让林小雨主动约陈默放学后见面…'
                        : '输入你想要的剧情方向，例如：让林小雨主动找陈默说话…'
                      }
                      value={intervention}
                      onChange={e => setIntervention(e.target.value)}
                      rows={2}
                      className="intervention-textarea"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showSaveDialog && (
        <div className="modal-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>保存剧场</h3>
            <p className="modal-hint">为你的剧场起一个名字，方便以后找到它</p>
            <div className="input-group">
              <label>剧场名称</label>
              <input
                type="text"
                placeholder="例如：校园青春故事、宿敌的羁绊"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowSaveDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!saveName.trim()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
