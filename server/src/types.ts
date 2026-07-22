// ============================================================
// 人间剧场 - 类型定义
// ============================================================

/** 用户 */
export interface User {
  id: number
  username: string
  password: string
  api_key: string
  api_base_url: string
  api_model: string
  created_at: string
}

/** 角色（人物） */
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

/** 人际关系 */
export interface Relationship {
  id: number
  user_id: number
  character_a_id: number
  character_b_id: number
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
  character_ids: string  // JSON数组字符串
  relationship_ids: string  // JSON数组字符串
  scene_id: number | null
  current_perspective: string  // 'god' | character_id
  story_history: string  // JSON字符串，存储剧情段落数组
  story_progress: string  // 当前累计剧情文本
  story_summary: string  // 剧情压缩摘要（累计10段后自动生成）
  status: string  // 'active' | 'archived'
  created_at: string
  updated_at: string
}

/** API返回格式 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
}

// ============================================================
// 多智能体剧场类型
// ============================================================

/** 角色思考结果（Phase 1 输出） */
export interface CharacterThought {
  character_id: number
  character_name: string
  internal_thought: string
  action_desc: string
  dialogue: string
  target_character: string | null
  emotional_state: string
}

/** 角色剧场演绎（Phase 2 输出） */
export interface CharacterAct {
  character_name: string
  action: string
  dialogue: string
  internal_thought: string
  emotional_state: string
}

/** Agent-Turn 请求参数 */
export interface AgentTurnRequest {
  theater_id: number
  story_summary?: string
  recent_context?: string
  user_intervention?: string
}

/** Agent-Turn 响应数据 */
export interface AgentTurnResponse {
  turn_number: number
  scene: { time: string; location: string }
  acts: CharacterAct[]
  story_progress: string
}
