// ============================================================
// 认证路由 - 注册、登录、获取用户信息、更新API配置
// ============================================================

import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import db from '../db'
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth'

const router = Router()

/**
 * POST /api/auth/register - 用户注册
 * 接收用户名、密码、API密钥，创建新账号
 */
router.post('/register', (req: AuthRequest, res: Response) => {
  const { username, password, api_key, api_base_url, api_model } = req.body

  // 校验必填字段
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' })
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ success: false, message: '用户名长度为2-20个字符' })
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '密码长度至少6位' })
  }
  // 注册时必须填写API密钥——没有大模型，人间剧场就无法运行
  if (!api_key) {
    return res.status(400).json({ success: false, message: '请填写API密钥，这是AI剧情生成的核心引擎' })
  }

  // 检查用户名是否已被注册
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) {
    return res.status(400).json({ success: false, message: '该用户名已被注册' })
  }

  // 密码加密存储
  const hashedPassword = bcrypt.hashSync(password, 10)

  const result = db.prepare(
    'INSERT INTO users (username, password, api_key, api_base_url, api_model) VALUES (?, ?, ?, ?, ?)'
  ).run(username, hashedPassword, api_key || '', api_base_url || '', api_model || 'gpt-3.5-turbo')

  const token = generateToken(result.lastInsertRowid as number, username)

  res.json({
    success: true,
    data: {
      token,
      user: { id: result.lastInsertRowid, username, api_key, api_base_url: api_base_url || '', api_model: api_model || 'gpt-3.5-turbo' },
    },
    message: '注册成功',
  })
})

/**
 * POST /api/auth/login - 用户登录
 * 验证用户名和密码，返回JWT令牌
 */
router.post('/login', (req: AuthRequest, res: Response) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请输入用户名和密码' })
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
  if (!user) {
    return res.status(400).json({ success: false, message: '用户名或密码错误' })
  }

  // 验证密码
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ success: false, message: '用户名或密码错误' })
  }

  const token = generateToken(user.id, user.username)

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        api_key: user.api_key || '',
        api_base_url: user.api_base_url || '',
        api_model: user.api_model || '',
      },
    },
    message: '登录成功',
  })
})

/**
 * GET /api/auth/me - 获取当前登录用户信息
 */
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  const user = db.prepare(
    'SELECT id, username, api_key, api_base_url, api_model, created_at FROM users WHERE id = ?'
  ).get(req.userId) as any

  if (!user) {
    return res.status(404).json({ success: false, message: '用户不存在' })
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
      api_key: user.api_key || '',
      api_base_url: user.api_base_url || '',
      api_model: user.api_model || '',
      created_at: user.created_at,
    },
  })
})

/**
 * PUT /api/auth/api-config - 更新用户的API配置
 */
router.put('/api-config', authMiddleware, (req: AuthRequest, res: Response) => {
  const { api_key, api_base_url, api_model } = req.body

  db.prepare(
    'UPDATE users SET api_key = ?, api_base_url = ?, api_model = ? WHERE id = ?'
  ).run(api_key || '', api_base_url || '', api_model || 'gpt-3.5-turbo', req.userId)

  res.json({ success: true, message: 'API配置已更新' })
})

export default router
