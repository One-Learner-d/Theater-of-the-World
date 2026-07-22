// ============================================================
// 剧场创建页面
// 左侧菜单栏：角色、关系、场景、剧情基调
// 右侧配置面板：新建/编辑各项配置
// 支持从历史数据中选择复用
// ============================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { characterApi, relationshipApi, sceneApi, theaterApi } from '../services/api'
import type { Character, Relationship, Scene } from '../types'
import './TheaterCreatePage.css'

// 左侧菜单项定义
type MenuItem = 'characters' | 'relationships' | 'scenes'

const MENU_ITEMS: { key: MenuItem; label: string; icon: string }[] = [
  { key: 'characters', label: '角色', icon: '👤' },
  { key: 'relationships', label: '关系', icon: '🔗' },
  { key: 'scenes', label: '场景', icon: '🌍' },
]

export default function TheaterCreatePage() {
  const navigate = useNavigate()

  // 当前菜单
  const [activeMenu, setActiveMenu] = useState<MenuItem>('characters')

  // 各模块数据列表
  const [characters, setCharacters] = useState<Character[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [scenes, setScenes] = useState<Scene[]>([])

  // 已选中的ID（用于创建剧场）
  const [selectedCharIds, setSelectedCharIds] = useState<number[]>([])
  const [selectedRelIds, setSelectedRelIds] = useState<number[]>([])
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)

  // 新建/编辑状态
  const [editing, setEditing] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')

  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  /** 显示消息提示 */
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  /** 加载所有数据 */
  const loadAll = async () => {
    setLoading(true)
    try {
      const [charRes, relRes, sceneRes] = await Promise.all([
        characterApi.list(),
        relationshipApi.list(),
        sceneApi.list(),
      ])
      if (charRes.success && charRes.data) setCharacters(charRes.data as Character[])
      if (relRes.success && relRes.data) setRelationships(relRes.data as Relationship[])
      if (sceneRes.success && sceneRes.data) setScenes(sceneRes.data as Scene[])
    } catch (err: any) {
      showToast('加载数据失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  /** 检查能否开始剧场 */
  const canStart = selectedCharIds.length >= 1 && selectedSceneId !== null

  /** 开始剧场：创建存档并跳转 */
  const handleStart = async () => {
    if (!canStart) {
      showToast('至少需要1个角色和1个场景才能开始')
      return
    }
    try {
      const res = await theaterApi.create({
        name: '新剧场',
        character_ids: selectedCharIds,
        relationship_ids: selectedRelIds,
        scene_id: selectedSceneId || undefined,
      })
      if (res.success && res.data) {
        navigate(`/story/${(res.data as any).id}`)
      }
    } catch (err: any) {
      showToast(err.message || '创建失败')
    }
  }

  // ============================================================
  // 角色管理
  // ============================================================

  /** 打开新建/编辑角色面板 */
  const openCharEdit = (char?: Character) => {
    setEditItem(char
      ? { name: char.name, gender: char.gender, age: char.age, appearance: char.appearance, personality: char.personality, description: char.description, id: char.id }
      : { name: '', gender: '', age: '', appearance: '', personality: '', description: '' }
    )
    setEditMode(char ? 'edit' : 'create')
    setEditing(true)
  }

  /** 保存角色 */
  const saveCharacter = async () => {
    if (!editItem.name.trim()) {
      showToast('角色名称不能为空')
      return
    }
    try {
      if (editMode === 'create') {
        const res = await characterApi.create(editItem)
        if (res.success && res.data) setCharacters(prev => [res.data as Character, ...prev])
      } else {
        const res = await characterApi.update(editItem.id, editItem)
        if (res.success && res.data) {
          setCharacters(prev => prev.map(c => c.id === editItem.id ? (res.data as Character) : c))
        }
      }
      setEditing(false)
      showToast(editMode === 'create' ? '角色创建成功' : '角色更新成功')
    } catch (err: any) {
      showToast(err.message || '操作失败')
    }
  }

  /** 删除角色 */
  const deleteCharacter = async (id: number) => {
    if (!confirm('确定删除此角色？')) return
    try {
      await characterApi.delete(id)
      setCharacters(prev => prev.filter(c => c.id !== id))
      setSelectedCharIds(prev => prev.filter(cid => cid !== id))
      setEditing(false)
      showToast('角色已删除')
    } catch (err: any) {
      showToast(err.message || '删除失败')
    }
  }

  /** 切换角色选中状态 */
  const toggleCharSelect = (id: number) => {
    setSelectedCharIds(prev =>
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    )
  }

  // ============================================================
  // 关系管理
  // ============================================================

  const openRelEdit = (rel?: Relationship) => {
    setEditItem(rel
      ? {
          character_a_id: rel.character_a_id,
          character_b_id: rel.character_b_id,
          description: rel.description,
          a_view: rel.a_view,
          b_view: rel.b_view,
          id: rel.id,
        }
      : {
          character_a_id: '',
          character_b_id: '',
          description: '',
          a_view: '',
          b_view: '',
        }
    )
    setEditMode(rel ? 'edit' : 'create')
    setEditing(true)
  }

  const saveRelationship = async () => {
    if (!editItem.character_a_id || !editItem.character_b_id) {
      showToast('请选择两个角色')
      return
    }
    if (editItem.character_a_id === editItem.character_b_id) {
      showToast('不能与自身建立关系')
      return
    }
    if (!editItem.description.trim()) {
      showToast('关系概述不能为空')
      return
    }
    try {
      const data = {
        character_a_id: Number(editItem.character_a_id),
        character_b_id: Number(editItem.character_b_id),
        description: editItem.description || '',
        a_view: editItem.a_view || '',
        b_view: editItem.b_view || '',
      }
      if (editMode === 'create') {
        const res = await relationshipApi.create(data)
        if (res.success && res.data) setRelationships(prev => [res.data as Relationship, ...prev])
      } else {
        const res = await relationshipApi.update(editItem.id, data)
        if (res.success && res.data) {
          setRelationships(prev => prev.map(r => r.id === editItem.id ? (res.data as Relationship) : r))
        }
      }
      setEditing(false)
      showToast(editMode === 'create' ? '关系创建成功' : '关系更新成功')
    } catch (err: any) {
      showToast(err.message || '操作失败')
    }
  }

  const deleteRelationship = async (id: number) => {
    if (!confirm('确定删除此关系？')) return
    try {
      await relationshipApi.delete(id)
      setRelationships(prev => prev.filter(r => r.id !== id))
      setSelectedRelIds(prev => prev.filter(rid => rid !== id))
      setEditing(false)
      showToast('关系已删除')
    } catch (err: any) {
      showToast(err.message || '删除失败')
    }
  }

  const toggleRelSelect = (id: number) => {
    setSelectedRelIds(prev =>
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    )
  }

  // ============================================================
  // 场景管理
  // ============================================================

  const openSceneEdit = (scene?: Scene) => {
    setEditItem(scene
      ? { time: scene.time, location: scene.location, id: scene.id }
      : { time: '', location: '' }
    )
    setEditMode(scene ? 'edit' : 'create')
    setEditing(true)
  }

  const saveScene = async () => {
    if (!editItem.time || !editItem.location) {
      showToast('时间和地点不能为空')
      return
    }
    try {
      const data = { time: editItem.time || '', location: editItem.location || '' }
      if (editMode === 'create') {
        const res = await sceneApi.create(data)
        if (res.success && res.data) {
          setScenes(prev => [res.data as Scene, ...prev])
          setSelectedSceneId((res.data as Scene).id)
        }
        showToast('场景创建成功')
      } else {
        await sceneApi.update(editItem.id, data)
        setScenes(prev => prev.map(s => s.id === editItem.id ? { ...s, ...data } : s))
        showToast('场景更新成功')
      }
      setEditing(false)
    } catch (err: any) {
      showToast(err.message || '操作失败')
    }
  }

  const deleteScene = async (id: number) => {
    if (!confirm('确定删除此场景？')) return
    try {
      await sceneApi.delete(id)
      setScenes(prev => prev.filter(s => s.id !== id))
      if (selectedSceneId === id) setSelectedSceneId(null)
      setEditing(false)
      showToast('场景已删除')
    } catch (err: any) {
      showToast(err.message || '删除失败')
    }
  }

  // ============================================================
  // 根据不同菜单项渲染编辑面板
  // ============================================================

  const renderEditForm = () => {
    switch (activeMenu) {
      case 'characters':
        return (
          <div className="edit-panel">
            <h3>{editMode === 'create' ? '新建角色' : '编辑角色'}</h3>
            <div className="input-group">
              <label>姓名 *</label>
              <input
                placeholder="例如：林晓、陆辞"
                value={editItem?.name || ''}
                onChange={e => setEditItem({ ...editItem, name: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>性别</label>
              <input
                placeholder="例如：女、男"
                value={editItem?.gender || ''}
                onChange={e => setEditItem({ ...editItem, gender: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>年龄</label>
              <input
                placeholder="例如：17岁、28岁、中年"
                value={editItem?.age || ''}
                onChange={e => setEditItem({ ...editItem, age: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>外貌</label>
              <input
                placeholder="例如：清秀白皙、高大英俊、温婉端庄"
                value={editItem?.appearance || ''}
                onChange={e => setEditItem({ ...editItem, appearance: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>性格</label>
              <textarea
                placeholder="例如：外表高冷内心细腻、开朗活泼、沉稳内敛"
                value={editItem?.personality || ''}
                onChange={e => setEditItem({ ...editItem, personality: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>人设描述</label>
              <textarea
                placeholder="详细描述角色的背景故事、行为习惯等"
                value={editItem?.description || ''}
                onChange={e => setEditItem({ ...editItem, description: e.target.value })}
              />
            </div>
            <div className="edit-actions">
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveCharacter}>保存</button>
              {editMode === 'edit' && (
                <button className="btn btn-danger" onClick={() => deleteCharacter(editItem.id)}>删除</button>
              )}
            </div>
          </div>
        )

      case 'relationships':
        return (
          <div className="edit-panel">
            <h3>{editMode === 'create' ? '新建关系' : '编辑关系'}</h3>
            <div className="input-group">
              <label>角色 A *</label>
              <select
                value={editItem?.character_a_id || ''}
                onChange={e => setEditItem({ ...editItem, character_a_id: e.target.value })}
              >
                <option value="">请选择角色</option>
                {characters.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>角色 B *</label>
              <select
                value={editItem?.character_b_id || ''}
                onChange={e => setEditItem({ ...editItem, character_b_id: e.target.value })}
              >
                <option value="">请选择角色</option>
                {characters.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label>关系概述 *</label>
              <input
                placeholder="例如：青梅竹马、双向暗恋、职场同事、宿敌"
                value={editItem?.description || ''}
                onChange={e => setEditItem({ ...editItem, description: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>角色 A 对此关系的看法</label>
              <textarea
                placeholder="A认为AB之间是什么关系？"
                value={editItem?.a_view || ''}
                onChange={e => setEditItem({ ...editItem, a_view: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>角色 B 对此关系的看法</label>
              <textarea
                placeholder="B认为AB之间是什么关系？"
                value={editItem?.b_view || ''}
                onChange={e => setEditItem({ ...editItem, b_view: e.target.value })}
              />
            </div>
            <div className="edit-actions">
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveRelationship}>保存</button>
              {editMode === 'edit' && (
                <button className="btn btn-danger" onClick={() => deleteRelationship(editItem.id)}>删除</button>
              )}
            </div>
          </div>
        )

      case 'scenes':
        return (
          <div className="edit-panel">
            <h3>{editMode === 'create' ? '新建场景' : '编辑场景'}</h3>
            <div className="input-group">
              <label>时间设定 *</label>
              <input
                placeholder="例如：2024年深秋、高中时期、古代"
                value={editItem?.time || ''}
                onChange={e => setEditItem({ ...editItem, time: e.target.value })}
              />
            </div>
            <div className="input-group">
              <label>地点设定 *</label>
              <input
                placeholder="例如：校园、都市职场、江南小镇"
                value={editItem?.location || ''}
                onChange={e => setEditItem({ ...editItem, location: e.target.value })}
              />
            </div>
            <div className="edit-actions">
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
              <button className="btn btn-primary" onClick={saveScene}>
                {editMode === 'create' ? '创建并选用' : '保存'}
              </button>
              {editMode === 'edit' && (
                <button className="btn btn-danger" onClick={() => deleteScene(editItem.id)}>删除</button>
              )}
            </div>
          </div>
        )
    }
  }

  // ============================================================
  // 渲染列表面板（卡片展示 + 选择）
  // ============================================================

  const renderList = () => {
    switch (activeMenu) {
      case 'characters':
        return (
          <>
            <div className="list-header">
              <h3>角色列表</h3>
              <button className="btn btn-primary" onClick={() => openCharEdit()}>+ 新建角色</button>
            </div>
            <div className="list-grid">
              {characters.map(char => (
                <div
                  key={char.id}
                  className={`list-card ${selectedCharIds.includes(char.id) ? 'selected' : ''}`}
                  onClick={() => toggleCharSelect(char.id)}
                >
                  <div className="list-card-info" onClick={e => { e.stopPropagation(); openCharEdit(char); }}>
                    <h4>{char.name}</h4>
                    <p>{[char.gender, char.age].filter(Boolean).join(' | ')}</p>
                    <p className="desc-text">{char.personality || char.description}</p>
                  </div>
                  <div className="list-card-check">
                    {selectedCharIds.includes(char.id) ? '✓ 已选' : '选择'}
                  </div>
                </div>
              ))}
              {characters.length === 0 && (
                <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                  <p>还没有创建角色</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>点击「新建角色」开始创建</p>
                </div>
              )}
            </div>
            {selectedCharIds.length > 0 && (
              <p className="select-hint">已选择 {selectedCharIds.length} 个角色（至少1个）</p>
            )}
          </>
        )

      case 'relationships':
        return (
          <>
            <div className="list-header">
              <h3>关系列表 <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>（未选择关系，角色之间将默认为陌生人）</span></h3>
              <button className="btn btn-primary" onClick={() => openRelEdit()}>+ 新建关系</button>
            </div>
            <div className="list-grid">
              {relationships.map(rel => (
                <div
                  key={rel.id}
                  className={`list-card ${selectedRelIds.includes(rel.id) ? 'selected' : ''}`}
                  onClick={() => toggleRelSelect(rel.id)}
                >
                  <div className="list-card-info" onClick={e => { e.stopPropagation(); openRelEdit(rel); }}>
                    <h4>{rel.character_a_name} ↔ {rel.character_b_name}</h4>
                    <p>{rel.description}</p>
                    {(rel.a_view || rel.b_view) && (
                      <p className="desc-text">
                        {rel.character_a_name}: {rel.a_view}
                        {rel.a_view && rel.b_view ? ' | ' : ''}
                        {rel.character_b_name}: {rel.b_view}
                      </p>
                    )}
                  </div>
                  <div className="list-card-check">
                    {selectedRelIds.includes(rel.id) ? '✓ 已选' : '选择'}
                  </div>
                </div>
              ))}
              {relationships.length === 0 && (
                <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                  <p>还没有创建关系</p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>先创建角色，然后建立他们之间的关系</p>
                </div>
              )}
            </div>
            {selectedRelIds.length > 0 && (
              <p className="select-hint">已选择 {selectedRelIds.length} 个关系（可选）</p>
            )}
          </>
        )

      case 'scenes':
        return (
          <>
            <div className="list-header">
              <h3>场景列表</h3>
              <button className="btn btn-primary" onClick={() => openSceneEdit()}>+ 新建场景</button>
            </div>
            <div className="list-grid">
              {scenes.map(scene => (
                <div
                  key={scene.id}
                  className={`list-card ${selectedSceneId === scene.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSceneId(selectedSceneId === scene.id ? null : scene.id)}
                >
                  <div className="list-card-info" onClick={e => { e.stopPropagation(); openSceneEdit(scene); }}>
                    <h4>{scene.location || '未设定地点'}</h4>
                    <p>🕐 {scene.time || '未设定时间'}</p>
                  </div>
                  <div className="list-card-check">
                    {selectedSceneId === scene.id ? '✓ 已选' : '选择'}
                  </div>
                </div>
              ))}
              {scenes.length === 0 && (
                <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                  <p>还没有创建场景</p>
                </div>
              )}
            </div>
          </>
        )

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="create-page">
        <nav className="nav-bar">
          <div className="logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/theaters')}>← 返回</div>
        </nav>
        <div className="loading">加载中...</div>
      </div>
    )
  }

  return (
    <div className="create-page">
      {/* 顶部导航 */}
      <nav className="nav-bar">
        <div className="logo" style={{ cursor: 'pointer' }} onClick={() => navigate('/theaters')}>
          ← 返回
        </div>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
          剧场创建
        </span>
        <div />
      </nav>

      {/* 消息提示 */}
      {toast && <div className="toast toast-info">{toast}</div>}

      {/* 主体 */}
      <div className="create-body">
        {/* 左侧菜单栏 */}
        <div className="create-sidebar">
          {MENU_ITEMS.map(item => (
            <button
              key={item.key}
              className={`menu-item ${activeMenu === item.key ? 'active' : ''}`}
              onClick={() => { setActiveMenu(item.key); setEditing(false); }}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-label">{item.label}</span>
            </button>
          ))}

        </div>

        {/* 右侧内容区 */}
        <div className="create-content">
          {editing ? renderEditForm() : renderList()}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="create-footer">
        <div className="footer-info">
          {!canStart && <span className="footer-hint">请至少选择 1 个角色和 1 个场景</span>}
          {canStart && <span className="footer-ready">配置完成，可以开始了！</span>}
        </div>
        <div className="footer-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/theaters')}>取消</button>
          <button
            className={`btn btn-primary ${!canStart ? 'disabled' : ''}`}
            onClick={handleStart}
            disabled={!canStart}
          >
            开始剧场
          </button>
        </div>
      </div>
    </div>
  )
}
