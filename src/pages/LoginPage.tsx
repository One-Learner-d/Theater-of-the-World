// ============================================================
// 登录注册页面
// 支持新用户注册、老用户登录、API密钥配置
// 蓝白色调居中简约布局
// ============================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { authApi } from '../services/api'
import './LoginPage.css'

export default function LoginPage() {
  // 当前模式: 'login' 或 'register'
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [apiModel, setApiModel] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  /** 切换登录/注册模式时清空输入和错误 */
  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setError('')
  }

  /** 提交表单 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      if (mode === 'register') {
        // 注册：校验必填项
        if (!username.trim() || !password.trim()) {
          setError('请填写用户名和密码')
          setSubmitting(false)
          return
        }
        if (password.length < 6) {
          setError('密码长度至少6位')
          setSubmitting(false)
          return
        }
        if (!apiKey.trim()) {
          setError('请填写API密钥——没有大模型，人间剧场就无法运行')
          setSubmitting(false)
          return
        }
        const res = await authApi.register({
          username: username.trim(),
          password,
          api_key: apiKey.trim(),
          api_base_url: apiBaseUrl.trim(),
          api_model: apiModel.trim(),
        })
        if (res.success && res.data) {
          const data = res.data as any
          login(data.token, data.user)
          navigate('/theaters')
        }
      } else {
        // 登录
        if (!username.trim() || !password.trim()) {
          setError('请输入用户名和密码')
          setSubmitting(false)
          return
        }
        const res = await authApi.login({ username: username.trim(), password })
        if (res.success && res.data) {
          const data = res.data as any
          login(data.token, data.user)
          navigate('/theaters')
        }
      }
    } catch (err: any) {
      setError(err.message || '操作失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      {/* 左侧装饰区域 */}
      <div className="login-sidebar">
        <div className="sidebar-content">
          <div className="logo-icon">🎭</div>
          <h1>人间剧场</h1>
          <p className="subtitle">让每个角色拥有独立的灵魂</p>
          <p className="desc">
            自定义角色与关系，AI 驱动即兴演绎
            <br />
            在这里，角色的每一次相遇都由你见证
          </p>
          <div className="features">
            <div className="feature-item">📖 小说体 · 叙事文学风格流畅阅读</div>
            <div className="feature-item">🎬 多智能体 · 角色自主思考即兴互动</div>
            <div className="feature-item">✨ 实时干预 · 每个选择都会改变剧情走向</div>
          </div>
        </div>
      </div>

      {/* 右侧登录/注册表单 */}
      <div className="login-form-area">
        <div className="form-container">
          {/* Tab 切换 */}
          <div className="tabs">
            <button
              className={`tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => switchMode()}
            >
              登录
            </button>
            <button
              className={`tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => switchMode()}
            >
              注册
            </button>
          </div>

          <h2 className="form-title">
            {mode === 'login' ? '欢迎回来' : '创建新账号'}
          </h2>

          {/* 表单 */}
          <form onSubmit={handleSubmit}>
            {/* 用户名 */}
            <div className="input-group">
              <label>用户名</label>
              <input
                type="text"
                placeholder="请输入用户名（2-20个字符）"
                value={username}
                onChange={e => setUsername(e.target.value)}
                maxLength={20}
              />
            </div>

            {/* 密码 */}
            <div className="input-group">
              <label>密码</label>
              <div className="api-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="请输入密码（至少6位）"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="toggle-key"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            {/* API配置（仅注册时显示） */}
            {mode === 'register' && (
              <>
                <div className="input-group">
                  <label>
                    API 密钥 <span className="required">*</span>
                  </label>
                  <div className="api-input-wrapper">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                    />
                    <button
                      type="button"
                      className="toggle-key"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? '隐藏' : '显示'}
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <label>API 基础地址</label>
                  <input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={apiBaseUrl}
                    onChange={e => setApiBaseUrl(e.target.value)}
                  />
                  <p className="input-hint">
                    支持 OpenAI / DeepSeek 等兼容接口，DeepSeek 地址: https://api.deepseek.com
                  </p>
                </div>

                <div className="input-group">
                  <label>模型名称</label>
                  <input
                    type="text"
                    placeholder="gpt-3.5-turbo / deepseek-chat"
                    value={apiModel}
                    onChange={e => setApiModel(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* 错误提示 */}
            {error && <div className="form-error">{error}</div>}

            {/* 提交按钮 */}
            <button
              type="submit"
              className="btn btn-primary submit-btn"
              disabled={submitting}
            >
              {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册并进入'}
            </button>
          </form>

          {/* 切换模式 */}
          <p className="switch-text">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button className="link-btn" onClick={switchMode}>
              {mode === 'login' ? '立即注册' : '去登录'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
