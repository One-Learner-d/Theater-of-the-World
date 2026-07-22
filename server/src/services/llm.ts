// ============================================================
// 大模型API服务 - 支持OpenAI/DeepSeek等兼容接口
// 用户必须使用自己的API Key，通过此模块驱动多智能体剧场演绎
// 没有API Key就无法运行——这是产品的核心引擎
// ============================================================

import fetch from 'node-fetch'

/** Fisher-Yates 洗牌算法——打破首位偏差，让 LLM 均匀关注每个角色 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** LLM请求参数 */
interface LLMRequest {
  api_key: string
  api_base_url: string
  api_model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

/** 调用大模型API，返回生成的文本内容 */
export async function callLLM(params: LLMRequest): Promise<string> {
  const { api_key, api_base_url, api_model, messages, temperature = 1.0, max_tokens = 2000 } = params

  const baseUrl = api_base_url.replace(/\/$/, '') || 'https://api.openai.com/v1'
  const url = `${baseUrl}/chat/completions`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`,
      },
      body: JSON.stringify({
        model: api_model || 'gpt-3.5-turbo',
        messages,
        temperature,
        max_tokens,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`API调用失败 (${response.status}): ${errBody}`)
    }

    const data = await response.json() as any
    return data.choices?.[0]?.message?.content || ''
  } catch (error: any) {
    console.error('[LLM] API调用异常:', error.message)
    throw new Error(`AI剧情生成失败: ${error.message}`)
  }
}

// ============================================================
// 多智能体剧场提示词
// ============================================================

/** 构建剧情摘要提示词 */
export function buildSummaryPrompt(text: string) {
  const systemPrompt = `你是一个剧情摘要助手。你的任务是将一段较长的故事内容压缩成简洁的摘要，保留关键的剧情信息。

要求：
- 保留主要角色及其当前状态
- 保留关键情节转折
- 保留角色之间的关系现状
- 保留当前场景/时间信息
- 删去对话细节和描写性文字
- 控制在200-300字
- 使用简洁的叙述语言，不要用markdown格式`

  const userPrompt = `请压缩以下故事内容，提取关键信息：\n\n${text}`

  return { systemPrompt, userPrompt }
}

/** 从LLM回复中提取并解析JSON（兼容各种格式问题） */
function extractJSON(text: string): any {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch {}

  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1].trim()) } catch {}
  }

  const objectMatch = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (objectMatch) {
    try { return JSON.parse(objectMatch[1]) } catch {}
  }

  throw new Error('无法从LLM回复中提取JSON')
}

/** 构建角色思考提示词（Phase 1） */
export function buildAgentThinkingPrompt(character: any, relationships: any[], recentContext: string, scene: any, allCharacters: any[], intervention?: string) {
  // 构建该角色对每个其他人的完整了解情况
  const relLines: string[] = []
  const knownNames = new Set<string>()

  // 获取角色的正确代词
  const pronoun = (name: string) => {
    const c = allCharacters.find((ch: any) => ch.name === name)
    if (!c) return 'TA'
    if (c.gender === '女') return '她'
    if (c.gender === '男') return '他'
    return 'TA'
  }

  // 随机打乱角色列表顺序，让每个角色在每次生成时获得大致相当的关注机会
  const shuffledOthers = shuffle(allCharacters.filter((c: any) => c.name !== character.name))

  for (const other of shuffledOthers) {
    if (other.name === character.name) continue
    const rel = relationships.find(
      (r: any) => (r.character_a_id === character.id && r.character_b_id === other.id) ||
                  (r.character_b_id === character.id && r.character_a_id === other.id)
    )
    if (rel) {
      knownNames.add(other.name)
      const isA = rel.character_a_id === character.id
      const view = isA ? (rel.a_view || '暂无特别看法') : (rel.b_view || '暂无特别看法')
      const p = pronoun(other.name)
      relLines.push(`- ${other.name}：你认识${p}，你们的关系是「${rel.description || '有关系'}」。你对${p}的看法：${view}`)
    } else {
      const g = other.gender === '女' ? '女生' : (other.gender === '男' ? '男生' : '陌生人')
      const p = other.gender === '女' ? '她' : (other.gender === '男' ? '他' : 'TA')
      relLines.push(`- 一位陌生的${g}（${other.appearance || '外貌不详'}）——你不认识${p}，不知道${p}的名字`)
    }
  }

  const myPronoun = character.gender === '女' ? '她' : (character.gender === '男' ? '他' : 'TA')
  const systemPrompt = `你是${character.name}（${character.gender || '性别不详'}→「${myPronoun}」），以下是你在这个世界中的人际关系——你必须严格遵守。

【你的设定】
- 性别：${character.gender || '未设定'}
- 年龄：${character.age || '未设定'}
- 性格：${character.personality || '未设定'}
- 背景：${character.description || '未设定'}
- 外貌：${character.appearance || '未设定'}

【你的人际关系一览】
${relLines.join('\n')}

【规则】
1. 对认识的人：可以用名字称呼对方，在对话、动作、内心想法中都可以使用名字
2. 对不认识的人：在对话、动作、内心想法中都不能说出或想到对方的名字——因为你还不知道TA叫什么。用「那个男生/女生/人」来描述
3. 即使故事摘要中出现了陌生人的名字，你仍然不知道TA是谁——摘要是从上帝视角写的，但你不是上帝
4. 关系不是一成不变的：陌生人可以变成熟人。但目前请严格遵守当前的关系设定
5. 你是${character.name}本人，用第一人称「我」思考

【对话要求】
- 对认识的人：说话要自然、随意，像平时相处一样。不要客套，不要像第一次见面那样自我介绍或寒暄
- 对不认识的人：才需要用礼貌、客套的语气，保持距离感

【核心】每一个想法、动作和对话都必须推动剧情向前发展。

【上下衔接——最重要】
- 你必须严格基于「已经发生的事」来思考下一步，不能忽略或重置上一轮已经发生的事情
- 上一轮你和谁在一起、在做什么、说了什么，这些状态必须延续到当前轮次
- 举例：如果上一轮你正在和某人面对面说话，这一轮你不能突然跑向TA——因为你们已经在对话了
- 你的反应必须是上一轮的延续和发展，而不是从头开始
- 【关键】不能编造没有发生过的事——例如某人上一轮没有说话，这一轮你不能说听到了TA说话。严格按照已发生的事实来推理`

  const sceneInfo = scene ? `【${scene.time || '未知时间'} · ${scene.location || '未知地点'}】` : '【场景未知】'

  let userPrompt = `场景：${sceneInfo}

已经发生的事：
${recentContext || '故事刚刚开始。'}

现在请你以${character.name}的身份做出反应，按以下格式输出6项（每行一个）：

内心想法：（你现在在想什么，第一人称）
动作：（你要做什么）
对话：（你要说什么，没有就写"无"）
目标：（你要和谁互动/对话，不认识的人用「那个男生/女生」代替名字，没有就写"无"）
情绪：（你现在的情绪状态）

【重要】已发生的事不要重复，你必须做出与之前不同的新反应——新的动作、新的对话、新的情绪变化。

输出示例：
内心想法：我有点紧张，不知道该不该开口。
动作：低下头假装看手机
对话：你……早上好
目标：陈默
情绪：紧张`

  if (intervention) {
    const emphasisBlock = `\n\n【★ 最重要的指令 — 必须严格遵循】\n剧情方向要求：${intervention}\n请在你的思考、动作和对话中优先体现这一点，其他格式要求仍然需要满足。`
    userPrompt = userPrompt.replace(
      '现在请你以',
      `${emphasisBlock}\n\n现在请你以`
    )
  }

  return { systemPrompt, userPrompt }
}

/** 构建场景编排提示词（Phase 2） */
export function buildSceneCompilationPrompt(thoughts: any[], scene: any, intervention?: string, allRelationships?: any[], allCharacters?: any[]) {
  const sceneInfo = scene ? `【${scene.time || '未知时间'} · ${scene.location || '未知地点'}】` : '【场景未知】'

  // 构建完整的角色关系矩阵
  const knownPairs = new Set<string>()
  ;(allRelationships || []).forEach((r: any) => {
    knownPairs.add(`${r.character_a_id}-${r.character_b_id}`)
    knownPairs.add(`${r.character_b_id}-${r.character_a_id}`)
  })
  const relMatrixLines: string[] = ['【角色关系对照表】（严格依据此表检查名字使用）']
  if (allCharacters) {
    for (let i = 0; i < allCharacters.length; i++) {
      for (let j = i + 1; j < allCharacters.length; j++) {
        const a = allCharacters[i], b = allCharacters[j]
        if (knownPairs.has(`${a.id}-${b.id}`)) {
          const rel = (allRelationships || []).find(
            (r: any) => (r.character_a_id === a.id && r.character_b_id === b.id) ||
                        (r.character_b_id === a.id && r.character_a_id === b.id)
          )
          const desc = rel ? rel.description : '有关系'
          relMatrixLines.push(`- ${a.name} 认识 ${b.name}（${desc}）：对话和内心想法都可以用名字`)
          relMatrixLines.push(`- ${b.name} 认识 ${a.name}（${desc}）：对话和内心想法都可以用名字`)
        } else {
          relMatrixLines.push(`- ${a.name} 不认识 ${b.name}（陌生人）：双方都不能用对方名字，用「那位同学/那个人/那边的女生/男生」指代`)
        }
      }
    }
  }
  const relMatrix = relMatrixLines.join('\n')

  // 打乱角色列表，让角色人设和代词的排列顺序随机化
  const shuffledForScene = shuffle(allCharacters || [])

  // 角色人设资料
  const charTraits = '【角色人设资料】\n' +
    shuffledForScene.map((c: any) => {
      const parts = [`- ${c.name}`]
      if (c.gender) parts.push(`性别：${c.gender}`)
      if (c.age) parts.push(`年龄：${c.age}`)
      if (c.personality) parts.push(`性格：${c.personality}`)
      if (c.appearance) parts.push(`外貌：${c.appearance}`)
      if (c.description) parts.push(`背景：${c.description}`)
      return parts.join('，')
    }).join('\n')

  // 角色代词
  const genderContext = '【角色代词对照】\n' +
    shuffledForScene.map((c: any) => {
      const p = c.gender === '女' ? '她' : (c.gender === '男' ? '他' : 'TA')
      return `- ${c.name} → 「${p}」`
    }).join('\n')

  const thoughtsText = thoughts.map((t, i) =>
    `=== ${t.character_name} ===
内心想法：${t.internal_thought}
打算做的动作：${t.action_desc}
打算说的话：${t.dialogue}
互动目标：${t.target_character || '无'}
情绪：${t.emotional_state || ''}`
  ).join('\n\n')

  const systemPrompt = `你是一部即兴剧场的导演，负责整合角色想法为连贯场景。

${relMatrix}

${charTraits}

${genderContext}

【核心规则】
1. 【关系一致性】严格按关系对照表检查——认识的人用名字，不认识的人用「那个男生/女生/人」
2. 【知识边界】每个角色只知道「角色关系对照表」中TA自己认识的人的信息。导演不能把关系表中其他角色的关系写进这个角色的内心想法或对话中。
   - 正确：A不认识C → A的内心想法和对话中不能出现C的名字，也不能知道C的任何事
   - 正确：A认识B → A的内心可以想「B是我的青梅竹马」
   - 错误：C不认识A，但C的内心想「不愧是B的青梅竹马」→ C不应该知道A是B的青梅竹马
3. 【逻辑自洽】所有角色的行动必须在同一时空内合理
4. 【全员出场】所有角色都必须出现在场景中，每人至少一个动作或对话
5. 【推动剧情】场景必须有实质进展
6. 【人设一致】角色言行符合其性格设定
7. 【对话自然】认识的人之间对话要自然随意，不要客套寒暄；只有陌生人才需要用礼貌、试探性的语气
8. 【上下衔接】新场景必须紧接上一轮的结尾——不能出现位置跳跃或关系倒退。例如上一轮A和B正在面对面说话，这一轮不能出现A跑向B或B在想「A会不会跟我说话」的矛盾
9. 【事实准确】不能编造没有发生过的事——如果某个角色上一轮没有说话，其他人就不能提到「听到TA说话」。一切基于已发生的事实
10. 【均衡戏份】打乱后的排列顺序不代表角色主次——导演必须确保所有角色都有大致相当的出镜机会，不能特别关注列在前面的角色
11. 动作描述不用「你我他她」，直接用角色名`

  let userPrompt = `场景设定：${sceneInfo}

每个角色的计划和想法：
${thoughtsText}

请整合成连贯的剧场场景，按以下JSON格式输出（只输出JSON数组）：

[
  {
    "character_name": "角色名",
    "action": "动作描述",
    "dialogue": "对话内容，没有就空字符串",
    "internal_thought": "内心想法",
    "emotional_state": "情绪状态"
  }
]

要求：
- 【最重要】所有角色都必须出现，不能遗漏任何一人——场景中必须包含每个角色的动作或对话
- 【最重要】内容不能重复上一轮——场景必须有新的发展，不能出现与之前相似的动作和对话
- 【最重要】上下衔接——场景必须紧接上一轮的结尾状态，不能有位置跳跃或关系倒退。上一轮在对话的人这一轮要继续对话状态，不能重置为"刚见面"
- 严格按关系对照表：不认识的人之间，对话和内心想法都不能出现对方名字
- 【关键】对话要符合关系设定：认识的人说话自然随意（像老朋友），陌生人之间才客套试探
- 【关键】每个角色只知道TA自己认识的人的信息。导演不能把「关系对照表」中其他角色之间的关系写到这个角色的内心想法里
- 动作描述中提到不认识的人也要用「那个男生/女生/人」而非名字
- 检查每个角色内心想法和对话中的人名使用是否一致`

  if (intervention) {
    const emphasisBlock = `\n\n【★ 最重要的导演指令 — 必须优先编排】\n剧情方向：${intervention}\n请在整合场景时确保角色的行动和对话都往这个方向推进。`
    userPrompt = userPrompt.replace(
      '请整合成连贯的剧场场景',
      `${emphasisBlock}\n\n请整合成连贯的剧场场景`
    )
  }

  return { systemPrompt, userPrompt }
}

/** 构建小说体章节生成提示词 */
export function buildNovelChapterPrompt(
  characters: any[],
  relationships: any[],
  scene: any,
  storySoFar: string,
  intervention?: string,
  previousRelationships?: any[],
  previousScene?: any
) {
  // 打乱角色和关系列表，避免 LLM 首位偏差——让每个角色获得大致相当的关注度
  const shuffledChars = shuffle(characters)
  const shuffledRels = shuffle(relationships)

  // 角色资料
  const charProfiles = shuffledChars.map((c: any) => {
    const parts = [`姓名：${c.name}`]
    if (c.gender) parts.push(`性别：${c.gender}`)
    if (c.age) parts.push(`年龄：${c.age}`)
    if (c.appearance) parts.push(`外貌：${c.appearance}`)
    if (c.personality) parts.push(`性格：${c.personality}`)
    if (c.description) parts.push(`背景：${c.description}`)
    return '- ' + parts.join('，')
  }).join('\n')

  // 关系描述
  const relDesc = shuffledRels.length > 0
    ? shuffledRels.map((r: any) =>
        `- ${r.character_a_name} 和 ${r.character_b_name}：${r.description || '有关系但不明确'}`
      ).join('\n')
    : '所有角色之间是陌生人，互不认识。'

  // 代词的性别映射
  const pronouns = (name: string) => {
    const c = characters.find((ch: any) => ch.name === name)
    if (!c) return { he: 'TA', his: 'TA的', him: 'TA' }
    if (c.gender === '女') return { he: '她', his: '她的', him: '她' }
    if (c.gender === '男') return { he: '他', his: '他的', him: '他' }
    return { he: 'TA', his: 'TA的', him: 'TA' }
  }

  const sceneInfo = scene
    ? `当前时间地点：${scene.time || '未知时间'} · ${scene.location || '未知地点'}`
    : '当前时间地点：未设定'

  const systemPrompt = `你是一位擅长人物关系和情感描写的文学作家，正在创作一部关于角色之间关系演变的叙事小说。

## 角色人设（这是角色的起点设定，但人物可以随着剧情发展而成长变化）
${charProfiles}

## 初始关系设定（这些是角色之间关系的起点，而非终点——关系可以随着剧情合理演变）
${relDesc}

## 当前场景设定（这是故事开始的场景，但故事可以自然地延伸到其他场景）
${sceneInfo}

## 核心创作规则

1. 【动态进化】初始设定是故事的起点而非终点。遵循"合理即允许"原则：
   - 关系可以变化：陌生人→朋友→恋人，朋友→疏远→和解，都可以自然发生
   - 场景可以变化：角色可以从校园走到校外，从城市到乡村，跟随剧情自然流动
   - 角色可以成长：人物的性格、认知、情感可以因经历而发生合理改变
   - 每一章都应该让世界比上一章"向前走一步"，不能原地打转

2. 【文学性】使用小说体的叙事语言，包含：
   - 环境描写：场景的氛围、光线、声音、气味等感官细节
   - 人物刻画：外貌、神态、动作、心理活动
   - 对话：自然的对话推动情节和展现人物性格
   - 叙事节奏：张弛有度，有起承转合

3. 【一致性】虽然设定可以变化，但角色的核心性格特征应该保持内在一致。

4. 【第三人称】使用第三人称有限视角写作，每章可以聚焦1-2个角色的视角，但不要频繁切换视角。

5. 【剧情推进】每章必须有实质性的剧情推进：要么人物关系有变化，要么情节有发展，要么揭示新的信息。

6. 【性别代词】正确使用「他/她」来指代角色：
${shuffledChars.map((c: any) => {
  const p = c.gender === '女' ? '她' : (c.gender === '男' ? '他' : 'TA')
  return `   - ${c.name} → 「${p}」`
}).join('\n')}

7. 【章节长度】每章约500-800字，内容充实但不冗长。

8. 【均衡关注】角色不分主次，每个角色都应得到与其人设相称的戏份。不要只关注排在前面的角色——所有的角色都是故事的重要组成部分，应当在章节中依次登场、各有表现。`

  let userPrompt = `## 故事已有进展
${storySoFar || '故事尚未开始。这是故事的起点——请从最初的场景开始叙述，引入角色和初始情境。'}

## 写作要求
请写出故事的下一章。如果是第一章，请从最初场景引入所有角色。

注意：
- 如果是第一章，需要自然地介绍出场角色和初始环境
- 从上一章结束的地方无缝衔接，不要重复已经发生过的事
- 推动剧情发展，让人物关系或情节有明显进展
- 如果剧情发展到适合转换场景的时候，大胆转换——初始场景不是限制
- 人物之间的关系可以随着互动自然演变，但要让读者感受到变化是合理且有铺垫的

请直接输出小说正文，不要包含章节标题之外的任何元信息。`

  if (intervention) {
    // 注入到写作要求的开头位置，加粗优先级——放在末尾容易被 LLM 忽略
    const emphasisBlock = `\n\n【★ 最重要的创作指令 — 必须优先执行】\n${intervention}\n请将以上指令作为本章最核心的创作方向，所有情节和人物行动都要围绕它展开。`
    userPrompt = userPrompt.replace(
      '请写出故事的下一章。如果是第一章，请从最初场景引入所有角色。',
      `请写出故事的下一章。如果是第一章，请从最初场景引入所有角色。${emphasisBlock}`
    )
  }

  return { systemPrompt, userPrompt }
}
