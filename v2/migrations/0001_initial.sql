-- ============================================================
-- Migration 0001 — Initial schema
--
-- 内容数据：discipline / school / scholar / kp + 关联表 + FTS5 搜索
-- 用户数据：user / session / magic_link / user_progress / user_note / subscription
-- 运营数据：sync_log（每次 deploy sync 留痕）
--
-- D1 = SQLite-compatible，所有 SQLite syntax 通用。
-- 应用：wrangler d1 migrations apply management-study-v2
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- 内容数据（KP / 学派 / 学者）
-- ============================================================

CREATE TABLE discipline (
  key                TEXT PRIMARY KEY,
  title_zh           TEXT NOT NULL,
  title_en           TEXT,
  title_ja           TEXT,
  tagline_zh         TEXT,
  tagline_ja         TEXT,
  accent             TEXT NOT NULL DEFAULT 'classic',
  themes_json        TEXT NOT NULL DEFAULT '[]',  -- JSON.stringify(themes[])
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE school (
  key                TEXT PRIMARY KEY,
  discipline         TEXT NOT NULL REFERENCES discipline(key),
  title_zh           TEXT NOT NULL,
  title_en           TEXT,
  title_ja           TEXT,
  era                TEXT NOT NULL DEFAULT '',
  summary_zh         TEXT NOT NULL DEFAULT '',
  summary_ja         TEXT,
  theme_key          TEXT NOT NULL,
  accent             TEXT NOT NULL DEFAULT 'classic',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_school_discipline ON school(discipline);
CREATE INDEX idx_school_theme ON school(discipline, theme_key);

CREATE TABLE scholar (
  key                TEXT PRIMARY KEY,
  discipline         TEXT NOT NULL REFERENCES discipline(key),
  name_zh            TEXT NOT NULL,
  name_en            TEXT,
  name_ja            TEXT,
  contribution_zh    TEXT NOT NULL DEFAULT '',
  contribution_ja    TEXT,
  lifespan           TEXT NOT NULL DEFAULT '',
  institution        TEXT NOT NULL DEFAULT '',
  nobel_year         TEXT,
  nobel_detail       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_scholar_discipline ON scholar(discipline);

CREATE TABLE kp (
  id                 TEXT PRIMARY KEY,
  discipline         TEXT NOT NULL REFERENCES discipline(key),
  year               TEXT NOT NULL DEFAULT '',
  title_zh           TEXT NOT NULL,
  title_en           TEXT,
  title_ja           TEXT,
  body_zh            TEXT NOT NULL,
  body_ja            TEXT,
  tags_json          TEXT NOT NULL DEFAULT '[]',  -- ["义","限"]
  format             TEXT NOT NULL DEFAULT 'narrative',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_kp_discipline ON kp(discipline);
CREATE INDEX idx_kp_updated_at ON kp(updated_at);

-- ===== Many-to-many 关联表 =====

CREATE TABLE kp_school (
  kp_id              TEXT NOT NULL REFERENCES kp(id) ON DELETE CASCADE,
  school_key         TEXT NOT NULL REFERENCES school(key) ON DELETE CASCADE,
  position           INTEGER NOT NULL DEFAULT 0,  -- 在该学派 KP 列表里的位置
  PRIMARY KEY (kp_id, school_key)
);
CREATE INDEX idx_kp_school_by_school ON kp_school(school_key, position);

CREATE TABLE kp_scholar (
  kp_id              TEXT NOT NULL REFERENCES kp(id) ON DELETE CASCADE,
  scholar_key        TEXT NOT NULL REFERENCES scholar(key) ON DELETE CASCADE,
  position           INTEGER NOT NULL DEFAULT 0,  -- 多学者时显示顺序
  PRIMARY KEY (kp_id, scholar_key)
);
CREATE INDEX idx_kp_scholar_by_scholar ON kp_scholar(scholar_key);

CREATE TABLE scholar_school (
  scholar_key        TEXT NOT NULL REFERENCES scholar(key) ON DELETE CASCADE,
  school_key         TEXT NOT NULL REFERENCES school(key) ON DELETE CASCADE,
  position           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scholar_key, school_key)
);
CREATE INDEX idx_scholar_school_by_school ON scholar_school(school_key);

-- ===== FTS5 全文搜索 =====
-- 三语统一索引，搜索时按用户输入语言走 zh/en/ja 列权重
CREATE VIRTUAL TABLE kp_fts USING fts5(
  id UNINDEXED,
  title_zh,
  title_en,
  title_ja,
  body_zh,
  body_ja,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- ============================================================
-- 用户数据（W2 启用）
-- ============================================================

CREATE TABLE user (
  id                 TEXT PRIMARY KEY,                  -- nanoid
  email              TEXT NOT NULL UNIQUE,
  display_name       TEXT,
  created_at         TEXT NOT NULL,
  email_verified_at  TEXT
);
CREATE INDEX idx_user_email ON user(email);

CREATE TABLE session (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at         INTEGER NOT NULL  -- unix ms
);
CREATE INDEX idx_session_user ON session(user_id);
CREATE INDEX idx_session_expires ON session(expires_at);

CREATE TABLE magic_link (
  token              TEXT PRIMARY KEY,
  email              TEXT NOT NULL,
  expires_at         INTEGER NOT NULL,
  used_at            TEXT
);
CREATE INDEX idx_magic_link_email ON magic_link(email);

CREATE TABLE user_progress (
  user_id            TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kp_id              TEXT NOT NULL REFERENCES kp(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'unread',    -- unread / read / favorited
  last_read_at       TEXT,
  PRIMARY KEY (user_id, kp_id)
);
CREATE INDEX idx_progress_user ON user_progress(user_id, status);

CREATE TABLE user_note (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kp_id              TEXT NOT NULL REFERENCES kp(id) ON DELETE CASCADE,
  body               TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_user_note_user_kp ON user_note(user_id, kp_id);

-- ============================================================
-- 订阅（W3 启用，先建表）
-- ============================================================

CREATE TABLE subscription (
  user_id            TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'free',      -- free / active / canceled / past_due
  plan               TEXT,                              -- monthly / yearly / lifetime
  current_period_end INTEGER,                           -- unix ms
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  updated_at         TEXT NOT NULL
);

-- ============================================================
-- 运营 / 审计
-- ============================================================

CREATE TABLE sync_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at             TEXT NOT NULL,
  commit_sha         TEXT NOT NULL,
  kp_count           INTEGER,
  school_count       INTEGER,
  scholar_count      INTEGER,
  duration_ms        INTEGER,
  status             TEXT NOT NULL DEFAULT 'success',   -- success / failed
  error_message      TEXT
);
CREATE INDEX idx_sync_log_ran_at ON sync_log(ran_at DESC);
