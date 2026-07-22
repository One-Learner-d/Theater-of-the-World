// ============================================================
// 剧场管理路由 - 角色/关系/场景/剧情基调/存档的CRUD操作
// ============================================================

import { Router, Response } from 'express'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()
// 所有剧场路由都需要登录认证
router.use(authMiddleware)

// ============================================================
// 角色管理
// ============================================================

/** 获取用户所有角色 */
router.get('/characters', (req: AuthRequest, res: Response) => {
  const characters = db.prepare(
    'SELECT * FROM characters WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId)
  res.json({ success: true, data: characters })
})

/** 创建新角色 */
router.post('/characters', (req: AuthRequest, res: Response) => {
  const { name, gender, age, appearance, personality, description } = req.body
  if (!name) {
    return res.status(400).json({ success: false, message: '角色名称不能为空' })
  }
  const result = db.prepare(
    'INSERT INTO characters (user_id, name, gender, age, appearance, personality, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.userId, name, gender || '', age || '', appearance || '', personality || '', description || '')
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(result.lastInsertRowid)
  res.json({ success: true, data: character, message: '角色创建成功' })
})

/** 更新角色信息 */
router.put('/characters/:id', (req: AuthRequest, res: Response) => {
  const { name, gender, age, appearance, personality, description } = req.body
  const character = db.prepare(
    'SELECT * FROM characters WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId) as any
  if (!character) {
    return res.status(404).json({ success: false, message: '角色不存在' })
  }
  db.prepare(
    'UPDATE characters SET name=?, gender=?, age=?, appearance=?, personality=?, description=? WHERE id=?'
  ).run(name, gender, age, appearance || '', personality, description, req.params.id)
  const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id)
  res.json({ success: true, data: updated, message: '角色更新成功' })
})

/** 删除角色 */
router.delete('/characters/:id', (req: AuthRequest, res: Response) => {
  const character = db.prepare(
    'SELECT * FROM characters WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId)
  if (!character) {
    return res.status(404).json({ success: false, message: '角色不存在' })
  }
  db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id)
  res.json({ success: true, message: '角色已删除' })
})

// ============================================================
// 关系管理
// ============================================================

/** 获取用户所有关系 */
router.get('/relationships', (req: AuthRequest, res: Response) => {
  const relationships = db.prepare(
    `SELECT r.*, ca.name as character_a_name, cb.name as character_b_name
     FROM relationships r
     LEFT JOIN characters ca ON r.character_a_id = ca.id
     LEFT JOIN characters cb ON r.character_b_id = cb.id
     WHERE r.user_id = ? ORDER BY r.created_at DESC`
  ).all(req.userId)
  res.json({ success: true, data: relationships })
})

/** 创建新关系 */
router.post('/relationships', (req: AuthRequest, res: Response) => {
  const { character_a_id, character_b_id, description, a_view, b_view } = req.body
  if (!character_a_id || !character_b_id) {
    return res.status(400).json({ success: false, message: '请选择关系的两个角色' })
  }
  if (character_a_id === character_b_id) {
    return res.status(400).json({ success: false, message: '不能与自身建立关系' })
  }
  const result = db.prepare(
    'INSERT INTO relationships (user_id, character_a_id, character_b_id, description, a_view, b_view) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, character_a_id, character_b_id, description || '', a_view || '', b_view || '')
  const rel = db.prepare(
    `SELECT r.*, ca.name as character_a_name, cb.name as character_b_name
     FROM relationships r
     LEFT JOIN characters ca ON r.character_a_id = ca.id
     LEFT JOIN characters cb ON r.character_b_id = cb.id
     WHERE r.id = ?`
  ).get(result.lastInsertRowid)
  res.json({ success: true, data: rel, message: '关系创建成功' })
})

/** 更新关系 */
router.put('/relationships/:id', (req: AuthRequest, res: Response) => {
  const { description, a_view, b_view } = req.body
  const rel = db.prepare(
    'SELECT * FROM relationships WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId)
  if (!rel) {
    return res.status(404).json({ success: false, message: '关系不存在' })
  }
  db.prepare(
    'UPDATE relationships SET description=?, a_view=?, b_view=? WHERE id=?'
  ).run(description, a_view, b_view, req.params.id)
  const updated = db.prepare(
    `SELECT r.*, ca.name as character_a_name, cb.name as character_b_name
     FROM relationships r
     LEFT JOIN characters ca ON r.character_a_id = ca.id
     LEFT JOIN characters cb ON r.character_b_id = cb.id
     WHERE r.id = ?`
  ).get(req.params.id)
  res.json({ success: true, data: updated, message: '关系更新成功' })
})

/** 删除关系 */
router.delete('/relationships/:id', (req: AuthRequest, res: Response) => {
  const rel = db.prepare(
    'SELECT * FROM relationships WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId)
  if (!rel) {
    return res.status(404).json({ success: false, message: '关系不存在' })
  }
  db.prepare('DELETE FROM relationships WHERE id = ?').run(req.params.id)
  res.json({ success: true, message: '关系已删除' })
})

// ============================================================
// 场景管理
// ============================================================

/** 获取所有场景 */
router.get('/scenes', (req: AuthRequest, res: Response) => {
  const scenes = db.prepare(
    'SELECT * FROM scenes WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.userId)
  res.json({ success: true, data: scenes })
})

/** 创建场景 */
router.post('/scenes', (req: AuthRequest, res: Response) => {
  const { time, location } = req.body
  if (!time && !location) {
    return res.status(400).json({ success: false, message: '请填写时间或地点' })
  }
  const result = db.prepare(
    'INSERT INTO scenes (user_id, time, location) VALUES (?, ?, ?)'
  ).run(req.userId, time || '', location || '')
  const scene = db.prepare('SELECT * FROM scenes WHERE id = ?').get(result.lastInsertRowid)
  res.json({ success: true, data: scene, message: '场景创建成功' })
})

/** 更新场景 */
router.put('/scenes/:id', (req: AuthRequest, res: Response) => {
  const { time, location } = req.body
  const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
  if (!scene) {
    return res.status(404).json({ success: false, message: '场景不存在' })
  }
  db.prepare('UPDATE scenes SET time=?, location=? WHERE id=?').run(time || '', location || '', req.params.id)
  const updated = db.prepare('SELECT * FROM scenes WHERE id = ?').get(req.params.id)
  res.json({ success: true, data: updated, message: '场景更新成功' })
})

/** 删除场景 */
router.delete('/scenes/:id', (req: AuthRequest, res: Response) => {
  const scene = db.prepare('SELECT * FROM scenes WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
  if (!scene) {
    return res.status(404).json({ success: false, message: '场景不存在' })
  }
  db.prepare('DELETE FROM scenes WHERE id = ?').run(req.params.id)
  res.json({ success: true, message: '场景已删除' })
})

// ============================================================
// 剧场存档管理
// ============================================================

/** 获取用户所有剧场存档列表（仅返回已手动存档的剧场） */
router.get('/', (req: AuthRequest, res: Response) => {
  const theaters = db.prepare(
    "SELECT * FROM theaters WHERE user_id = ? AND story_progress != '' ORDER BY updated_at DESC"
  ).all(req.userId)

  // 为每个存档补充关联的角色和场景名称
  const result = theaters.map((t: any) => {
    const charIds = JSON.parse(t.character_ids || '[]')
    const characters = charIds.length > 0
      ? db.prepare(
          `SELECT id, name FROM characters WHERE id IN (${charIds.map(() => '?').join(',')})`
        ).all(...charIds)
      : []
    const scene = t.scene_id
      ? db.prepare('SELECT * FROM scenes WHERE id = ?').get(t.scene_id) as any
      : null
    return { ...t, characters, scene }
  })

  res.json({ success: true, data: result })
})

/** 获取单个剧场存档详情 */
router.get('/:id', (req: AuthRequest, res: Response) => {
  const theater = db.prepare(
    'SELECT * FROM theaters WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId) as any
  if (!theater) {
    return res.status(404).json({ success: false, message: '剧场不存在' })
  }

  // 补充完整关联数据
  const charIds = JSON.parse(theater.character_ids || '[]')
  const characters = charIds.length > 0
    ? db.prepare(
        `SELECT * FROM characters WHERE id IN (${charIds.map(() => '?').join(',')})`
      ).all(...charIds)
    : []
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

  res.json({
    success: true,
    data: { ...theater, characters, relationships, scene },
  })
})

/** 创建新剧场存档 */
router.post('/', (req: AuthRequest, res: Response) => {
  const { name, character_ids, relationship_ids, scene_id } = req.body

  // 校验至少需要1个角色和1个场景
  const chars = character_ids || []
  if (chars.length < 1) {
    return res.status(400).json({ success: false, message: '至少需要1个角色' })
  }
  if (!scene_id) {
    return res.status(400).json({ success: false, message: '请选择一个场景' })
  }

  const result = db.prepare(
    `INSERT INTO theaters (user_id, name, character_ids, relationship_ids, scene_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    req.userId,
    name || '未命名剧场',
    JSON.stringify(chars),
    JSON.stringify(relationship_ids || []),
    scene_id || null
  )

  const theater = db.prepare('SELECT * FROM theaters WHERE id = ?').get(result.lastInsertRowid)
  res.json({ success: true, data: theater, message: '剧场创建成功' })
})

/** 更新剧场（存档当前进度） */
router.put('/:id', (req: AuthRequest, res: Response) => {
  const theater = db.prepare(
    'SELECT * FROM theaters WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId)
  if (!theater) {
    return res.status(404).json({ success: false, message: '剧场不存在' })
  }
  const { story_history, story_progress, story_summary, current_perspective, name } = req.body
  db.prepare(
    `UPDATE theaters SET story_history=?, story_progress=?, story_summary=?, current_perspective=?, name=?, updated_at=datetime('now','localtime') WHERE id=?`
  ).run(
    story_history || '[]',
    story_progress || '',
    story_summary || '',
    current_perspective || 'god',
    name || '未命名剧场',
    req.params.id
  )
  const updated = db.prepare('SELECT * FROM theaters WHERE id = ?').get(req.params.id)
  res.json({ success: true, data: updated, message: '存档成功' })
})

/** 删除剧场存档 */
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const theater = db.prepare(
    'SELECT * FROM theaters WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.userId)
  if (!theater) {
    return res.status(404).json({ success: false, message: '剧场不存在' })
  }
  db.prepare('DELETE FROM theaters WHERE id = ?').run(req.params.id)
  res.json({ success: true, message: '剧场已删除' })
})

export default router
