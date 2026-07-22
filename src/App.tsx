// ============================================================
// 根组件 - 路由配置与全局状态管理
// ============================================================

import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import TheaterSelectPage from './pages/TheaterSelectPage'
import TheaterCreatePage from './pages/TheaterCreatePage'
import StoryViewPage from './pages/StoryViewPage'
import { authApi } from './services/api'
import type { User } from './types'

// ============================================================
// 全局用户上下文 - 所有子页面共享用户登录状态
// ============================================================

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  loading: boolean
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
  loading: true,
})

/** 在其他组件中获取用户状态的快捷方式 */
export function useAuth() {
  return useContext(AuthContext)
}

// ============================================================
// 受保护的路由 - 未登录时跳转登录页
// ============================================================

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()

  if (loading) {
    return <div className="loading">加载中...</div>
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// ============================================================
// 应用根组件
// ============================================================

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  /** 登录成功：保存令牌和用户信息 */
  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken)
    setToken(newToken)
    setUser(newUser)
  }

  /** 退出登录：清除所有状态 */
  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    navigate('/login')
  }

  /** 应用启动时，检查是否有有效的登录令牌 */
  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await authApi.getMe()
          if (res.success && res.data) {
            setUser(res.data as User)
          } else {
            // 令牌无效，清除
            localStorage.removeItem('token')
            setToken(null)
          }
        } catch {
          // 网络错误或令牌过期
          localStorage.removeItem('token')
          setToken(null)
        }
      }
      setLoading(false)
    }
    initAuth()
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      <Routes>
        {/* 登录注册页 */}
        <Route path="/login" element={
          token ? <Navigate to="/theaters" replace /> : <LoginPage />
        } />

        {/* 剧场选择页（首页） */}
        <Route path="/theaters" element={
          <ProtectedRoute>
            <TheaterSelectPage />
          </ProtectedRoute>
        } />

        {/* 剧场创建页 */}
        <Route path="/create" element={
          <ProtectedRoute>
            <TheaterCreatePage />
          </ProtectedRoute>
        } />

        {/* 剧情观察页 */}
        <Route path="/story/:id" element={
          <ProtectedRoute>
            <StoryViewPage />
          </ProtectedRoute>
        } />

        {/* 默认重定向 */}
        <Route path="*" element={<Navigate to={token ? '/theaters' : '/login'} replace />} />
      </Routes>
    </AuthContext.Provider>
  )
}
