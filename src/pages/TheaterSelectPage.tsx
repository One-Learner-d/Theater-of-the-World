// ============================================================
// 剧场选择页面 - 产品核心首页
// 展示新建剧场入口和历史存档列表
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { theaterApi, authApi } from '../services/api'
import type { Theater } from '../types'
import './TheaterSelectPage.css'

export default function TheaterSelectPage() {
  const [theaters, setTheaters] = useState<Theater[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // API配置弹窗状态
  const [showApiConfig, setShowApiConfig] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [apiModel, setApiModel] = useState('')
  const [savingApi, setSavingApi] = useState(false)
  const [apiMsg, setApiMsg] = useState('')

  /** 加载用户的所有剧场存档 */
  const loadTheaters = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await theaterApi.list()
      if (res.success && res.data) {
        setTheaters(res.data as Theater[])
      }
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTheaters()
  }, [])

  /** 导出剧场内容为TXT文件 */
  const handleExport = (e: React.MouseEvent, theater: Theater) => {
    e.stopPropagation()
    try {
      // 构建导出的文本内容
      let content = `========================================\n`
      content += `  人间剧场 - 存档导出\n`
      content += `========================================\n\n`
      content += `【剧场名称】${theater.name || '未命名'}\n`
      content += `【创建时间】${theater.created_at || ''}\n`
      content += `【更新时间】${theater.updated_at || ''}\n\n`

      // 角色信息
      if (theater.characters && theater.characters.length > 0) {
        content += `--- 角色列表 ---\n`
        theater.characters.forEach((c: any) => {
          content += `  ${c.name}`
          if (c.gender || c.age) content += `（${[c.gender, c.age].filter(Boolean).join('，')}）`
          content += '\n'
          if (c.personality) content += `    性格：${c.personality}\n`
          if (c.description) content += `    背景：${c.description}\n`
        })
        content += '\n'
      }

      // 场景信息
      if (theater.scene) {
        content += `【初始场景】${theater.scene.location || '未知地点'}，${theater.scene.time || '未知时间'}\n\n`
      }

      // 剧情正文
      if (theater.story_progress) {
        content += `========================================\n`
        content += `  剧情正文\n`
        content += `========================================\n\n`
        content += theater.story_progress
        content += '\n\n'
      }

      content += `========================================\n`
      content += `  导出时间：${new Date().toLocaleString('zh-CN')}\n`
      content += `========================================\n`

      // 创建并下载文件
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${theater.name || '人间剧场'}_存档.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('导出失败：' + err.message)
    }
  }

  /** 删除存档 */
  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个剧场存档吗？此操作不可撤销。')) return
    try {
      await theaterApi.delete(id)
      setTheaters(theaters.filter(t => t.id !== id))
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  /** 保存API配置 */
  const handleSaveApi = async () => {
    setSavingApi(true)
    setApiMsg('')
    try {
      await authApi.updateApiConfig({
        api_key: apiKey,
        api_base_url: apiBaseUrl,
        api_model: apiModel,
      })
      setApiMsg('API配置已保存')
      setTimeout(() => setShowApiConfig(false), 1000)
    } catch (err: any) {
      setApiMsg(err.message || '保存失败')
    } finally {
      setSavingApi(false)
    }
  }

  return (
    <div className="select-page">
      {/* 顶部导航 */}
      <nav className="nav-bar">
        <div className="logo">
          <span>🎭</span>
          人间剧场
        </div>
        <div className="nav-right">
          <span className="user-info">欢迎, {user?.username}</span>
          <button className="logout-btn" onClick={async () => {
            // 打开API设置弹窗时，加载已保存的配置
            try {
              const res = await authApi.getMe()
              if (res.success && res.data) {
                const u = res.data as any
                setApiKey(u.api_key || '')
                setApiBaseUrl(u.api_base_url || '')
                setApiModel(u.api_model || '')
              }
            } catch {}
            setShowApiConfig(true)
          }}>API设置</button>
          <button className="logout-btn" onClick={logout}>退出</button>
        </div>
      </nav>

      {/* 页面主体 */}
      <div className="select-content">
        <h1 className="page-title">剧场选择</h1>
        <p className="page-desc">创建新的人间剧场，或继续观看历史存档</p>

        {error && <div className="error-msg">{error}</div>}

        {/* 剧场卡片列表 */}
        <div className="theater-grid">
          {/* 新建剧场卡片 */}
          <div className="theater-card create-card" onClick={() => navigate('/create')}>
            <div className="create-icon">+</div>
            <p className="create-text">创建新人间剧场</p>
            <p className="create-hint">自定义角色、关系与场景，开启全新剧情</p>
          </div>

          {/* 加载状态 */}
          {loading && <div className="loading" style={{ gridColumn: '1/-1' }}>加载存档中...</div>}

          {/* 历史存档卡片 */}
          {!loading && theaters.map(theater => (
            <div
              key={theater.id}
              className="theater-card archive-card"
              onClick={() => navigate(`/story/${theater.id}`)}
            >
              <div className="card-header">
                <h3 className="card-title">{theater.name}</h3>
                <button
                  className="delete-btn"
                  onClick={e => handleDelete(e, theater.id)}
                  title="删除存档"
                >
                  ×
                </button>
              </div>
              <div className="card-body">
                {/* 显示角色 */}
                {theater.characters && theater.characters.length > 0 && (
                  <div className="card-chars">
                    {theater.characters.map(c => (
                      <span key={c.id} className="char-tag">{c.name}</span>
                    ))}
                  </div>
                )}
                {/* 显示场景 */}
                {theater.scene && (
                  <p className="card-scene">
                    📍 {theater.scene.location || ''} | 🕐 {theater.scene.time || ''}
                  </p>
                )}
              </div>
              <div className="card-footer">
                <span className="card-time">{theater.updated_at}</span>
                <button
                  className="export-btn"
                  onClick={e => handleExport(e, theater)}
                  title="导出为TXT"
                >
                  导出TXT
                </button>
              </div>
            </div>
          ))}

          {/* 无存档提示 */}
          {!loading && theaters.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>
              <div className="empty-icon">🎭</div>
              <p>还没有剧场存档</p>
              <p style={{ fontSize: '13px', marginTop: '8px', color: 'var(--text-muted)' }}>
                点击上方卡片创建你的第一个人间剧场
              </p>
            </div>
          )}
        </div>
      </div>

      {/* API配置弹窗 */}
      {showApiConfig && (
        <div className="modal-overlay" onClick={() => setShowApiConfig(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>API 配置</h3>
            <p className="modal-hint">配置你的大模型API密钥，用于多智能体剧场演绎。支持 OpenAI / DeepSeek 等兼容接口。</p>
            <div className="input-group">
              <label>API 密钥</label>
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
                placeholder="https://api.openai.com/v1"
                value={apiBaseUrl}
                onChange={e => setApiBaseUrl(e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>模型名称</label>
              <input
                placeholder="gpt-3.5-turbo / deepseek-chat"
                value={apiModel}
                onChange={e => setApiModel(e.target.value)}
              />
            </div>
            {apiMsg && <p className="api-msg">{apiMsg}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowApiConfig(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSaveApi} disabled={savingApi}>
                {savingApi ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
