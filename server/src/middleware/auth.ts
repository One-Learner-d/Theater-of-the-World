// ============================================================
// 认证中间件 - 验证用户JWT令牌
// ============================================================

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// JWT密钥（生产环境应使用环境变量）
const JWT_SECRET = 'renjian-juchang-secret-key-2024'

/** 扩展Express的Request类型，添加上下文用户信息 */
export interface AuthRequest extends Request {
  userId?: number
  username?: string
}

/** 生成JWT令牌 */
export function generateToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' })
}

/** 验证JWT令牌的中间件 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // 从请求头获取令牌：Authorization: Bearer <token>
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未登录，请先登录' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; username: string }
    req.userId = decoded.userId
    req.username = decoded.username
    next()
  } catch {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' })
  }
}
