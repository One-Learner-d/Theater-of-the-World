// ============================================================
// 人间剧场 - 数据库初始化
// 使用 SQLite 轻量级数据库，无需额外安装数据库服务
// 数据文件存储在 server/data/database.sqlite
// ============================================================

import Database, { Database as DatabaseType } from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// 确保 data 目录存在
const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'database.sqlite')
const db: DatabaseType = new Database(dbPath)

// 启用 WAL 模式（写前日志），提升并发性能
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ============================================================
// 创建数据表（如果不存在）
// ============================================================

/** 用户表 */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    api_key TEXT DEFAULT '',
    api_base_url TEXT DEFAULT '',
    api_model TEXT DEFAULT 'gpt-3.5-turbo',
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`)

/** 角色表 */
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    gender TEXT DEFAULT '',
    age TEXT DEFAULT '',
    appearance TEXT DEFAULT '',
    personality TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`)

/** 人际关系表（双向关系） */
db.exec(`
  CREATE TABLE IF NOT EXISTS relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    character_a_id INTEGER NOT NULL,
    character_b_id INTEGER NOT NULL,
    description TEXT DEFAULT '',
    a_view TEXT DEFAULT '',
    b_view TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (character_a_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (character_b_id) REFERENCES characters(id) ON DELETE CASCADE
  )
`)

/** 场景表 */
db.exec(`
  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    time TEXT DEFAULT '',
    location TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`)

/** 剧场存档表 */
db.exec(`
  CREATE TABLE IF NOT EXISTS theaters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT DEFAULT '未命名剧场',
    character_ids TEXT DEFAULT '[]',
    relationship_ids TEXT DEFAULT '[]',
    scene_id INTEGER,
    current_perspective TEXT DEFAULT 'god',
    story_history TEXT DEFAULT '[]',
    story_progress TEXT DEFAULT '',
    story_summary TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`)

// ============================================================
// 数据库迁移 - 为已存在的表添加新字段（兼容旧数据库）
// ============================================================

// 为 characters 表添加 appearance 列（如果不存在）
try {
  db.exec('ALTER TABLE characters ADD COLUMN appearance TEXT DEFAULT \'\'')
  console.log('[DB] 迁移: characters 表添加 appearance 列')
} catch {
  // 列已存在，忽略
}

console.log('[DB] 数据库初始化完成')

export default db
