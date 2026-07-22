// ============================================================
// 人间剧场 - 服务器入口
// Express + SQLite 后端服务
// ============================================================

import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth'
import theaterRoutes from './routes/theater'
import storyRoutes from './routes/story'

const app = express()
const PORT = 3001

// ============================================================
// 中间件配置
// ============================================================

// 跨域支持（开发环境允许前端Vite请求）
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))

// 解析JSON请求体
app.use(express.json({ limit: '10mb' }))

// ============================================================
// 路由注册
// ============================================================

// 健康检查接口
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: '人间剧场服务运行中', time: new Date().toLocaleString('zh-CN') })
})

// 模块路由
app.use('/api/auth', authRoutes)     // 登录注册、API配置
app.use('/api/theaters', theaterRoutes)  // 剧场CRUD
app.use('/api/story', storyRoutes)    // 多智能体剧场

// ============================================================
// 全局错误处理
// ============================================================

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err)
  res.status(500).json({
    success: false,
    message: err.message || '服务器内部错误，请稍后重试',
  })
})

// ============================================================
// 启动服务器
// ============================================================

app.listen(PORT, () => {
  console.log('========================================')
  console.log('  人间剧场 - 人类关系模拟器')
  console.log(`  服务已启动: http://localhost:${PORT}`)
  console.log('  API 基础路径: /api')
  console.log('========================================')
})
