-- ============================================================
-- Migration 0013 — API Token 系统 (v0.5.96)
--
-- 让 admin / 老师 可生成 API token 给 Claude / GPT 等 agent 用。
-- token 关联到具体 user，权限完全复用现有的 user_permission RBAC。
--
-- 字段说明:
--   id            UUID-ish 短串 (10 chars), 主键 + UI 引用
--   user_id       关联 user 表，user 删 → cascade 删 token
--   name          用户友好名 ("GPT for marketing")
--   token_hash    SHA-256 hex (token 明文只在创建时一次性返回，之后只存 hash)
--   scopes_json   JSON array of discipline keys, 如 ["marketing"] 或 [] 表示全 user 权限
--                 实际权限检查仍走 user_permission，scope 仅作 token 自身的"再收窄"
--   created_at    ISO 8601
--   expires_at    ISO 8601, NULL = 永不过期
--   last_used_at  每次成功 auth 时更新（轻量 best-effort 写入）
--   revoked_at    撤销时间，NULL = 未撤销
-- ============================================================

CREATE TABLE api_token (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  scopes_json   TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  expires_at    TEXT,
  last_used_at  TEXT,
  revoked_at    TEXT
);
CREATE INDEX idx_api_token_user ON api_token(user_id);
