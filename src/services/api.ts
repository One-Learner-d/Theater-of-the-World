// ============================================================
// API 服务层 - 封装所有后端接口调用
// ============================================================

import type { ApiResponse, User, Character, Relationship, Scene, Theater, AgentTurnData, NovelChapterData, SummarizeData } from '../types'

// 获取存储的令牌
function getToken(): string | null {
  return localStorage.getItem('token')
}

// 通用的请求包装
async function request<T>(url: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  // 如果有登录令牌，自动添加到请求头
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(result.message || '请求失败')
  }

  return result
}

// ============================================================
// 认证相关
// ============================================================

/** 用户注册 */
export const authApi = {
  register: (data: { username: string; password: string; api_key?: string; api_base_url?: string; api_model?: string }) =>
    request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  /** 用户登录 */
  login: (data: { username: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  /** 获取当前用户信息 */
  getMe: () =>
    request<User>('/api/auth/me'),

  /** 更新API配置 */
  updateApiConfig: (data: { api_key: string; api_base_url: string; api_model: string }) =>
    request('/api/auth/api-config', { method: 'PUT', body: JSON.stringify(data) }),
}

// ============================================================
// 角色管理
// ============================================================

export const characterApi = {
  /** 获取所有角色 */
  list: () => request<Character[]>('/api/theaters/characters'),

  /** 创建角色 */
  create: (data: { name: string; gender: string; age: string; personality: string; description: string }) =>
    request<Character>('/api/theaters/characters', { method: 'POST', body: JSON.stringify(data) }),

  /** 更新角色 */
  update: (id: number, data: Partial<Character>) =>
    request<Character>(`/api/theaters/characters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** 删除角色 */
  delete: (id: number) =>
    request(`/api/theaters/characters/${id}`, { method: 'DELETE' }),
}

// ============================================================
// 关系管理
// ============================================================

export const relationshipApi = {
  /** 获取所有关系 */
  list: () => request<Relationship[]>('/api/theaters/relationships'),

  /** 创建关系 */
  create: (data: { character_a_id: number; character_b_id: number; description: string; a_view: string; b_view: string }) =>
    request<Relationship>('/api/theaters/relationships', { method: 'POST', body: JSON.stringify(data) }),

  /** 更新关系 */
  update: (id: number, data: Partial<Relationship>) =>
    request<Relationship>(`/api/theaters/relationships/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** 删除关系 */
  delete: (id: number) =>
    request(`/api/theaters/relationships/${id}`, { method: 'DELETE' }),
}

// ============================================================
// 场景管理
// ============================================================

export const sceneApi = {
  /** 获取所有场景 */
  list: () => request<Scene[]>('/api/theaters/scenes'),

  /** 创建场景 */
  create: (data: { time: string; location: string }) =>
    request<Scene>('/api/theaters/scenes', { method: 'POST', body: JSON.stringify(data) }),

  /** 更新场景 */
  update: (id: number, data: { time: string; location: string }) =>
    request<Scene>(`/api/theaters/scenes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** 删除场景 */
  delete: (id: number) =>
    request(`/api/theaters/scenes/${id}`, { method: 'DELETE' }),
}

// ============================================================
// 剧场存档管理
// ============================================================

export const theaterApi = {
  /** 获取所有剧场存档 */
  list: () => request<Theater[]>('/api/theaters'),

  /** 获取单个剧场详情（含完整关联数据） */
  get: (id: number) => request<Theater>(`/api/theaters/${id}`),

  /** 创建新剧场 */
  create: (data: { name: string; character_ids: number[]; relationship_ids: number[]; scene_id?: number }) =>
    request<Theater>('/api/theaters', { method: 'POST', body: JSON.stringify(data) }),

  /** 更新剧场（存档） */
  update: (id: number, data: Partial<Theater>) =>
    request<Theater>(`/api/theaters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** 删除剧场 */
  delete: (id: number) =>
    request(`/api/theaters/${id}`, { method: 'DELETE' }),
}

// ============================================================
// 多智能体剧场
// ============================================================

export const storyApi = {
  /** 多智能体剧场：执行一幕（角色思考+场景演绎） */
  agentTurn: (data: { theater_id: number; story_summary?: string; recent_context?: string; user_intervention?: string }) =>
    request<AgentTurnData>('/api/story/agent-turn', { method: 'POST', body: JSON.stringify(data) }),

  /** 小说体：生成下一章 */
  novelChapter: (data: { theater_id: number; story_so_far?: string; user_intervention?: string }) =>
    request<NovelChapterData>('/api/story/novel-chapter', { method: 'POST', body: JSON.stringify(data) }),

  /** 剧情摘要压缩 */
  summarize: (data: { text: string }) =>
    request<SummarizeData>('/api/story/summarize', { method: 'POST', body: JSON.stringify(data) }),
}
