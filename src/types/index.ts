// ============================================================
// 前端类型定义
// ============================================================

/** 用户信息 */
export interface User {
  id: number
  username: string
  api_key: string
  api_base_url: string
  api_model: string
  created_at: string
}

/** 角色 */
export interface Character {
  id: number
  user_id: number
  name: string
  gender: string
  age: string
  appearance: string
  personality: string
  description: string
  created_at: string
}

/** 关系 */
export interface Relationship {
  id: number
  user_id: number
  character_a_id: number
  character_b_id: number
  character_a_name?: string
  character_b_name?: string
  description: string
  a_view: string
  b_view: string
  created_at: string
}

/** 场景 */
export interface Scene {
  id: number
  user_id: number
  time: string
  location: string
  created_at: string
}

/** 剧场存档 */
export interface Theater {
  id: number
  user_id: number
  name: string
  character_ids: string
  relationship_ids: string
  scene_id: number | null
  current_perspective: string
  story_history: string
  story_progress: string
  story_summary: string
  status: string
  characters?: Character[]
  relationships?: Relationship[]
  scene?: Scene | null
  created_at: string
  updated_at: string
}

/** API通用响应 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
}

/** 角色剧场演绎 */
export interface CharacterAct {
  character_name: string
  action: string
  dialogue: string
  internal_thought: string
  emotional_state: string
}

/** Agent-Turn 响应 */
export interface AgentTurnData {
  turn_number: number
  scene: { time: string; location: string }
  acts: CharacterAct[]
  story_progress: string
}

/** 小说体章节响应 */
export interface NovelChapterData {
  chapter_title: string
  chapter_text: string
  story_progress: string
}

/** 剧情摘要响应 */
export interface SummarizeData {
  summary: string
}
