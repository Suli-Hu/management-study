-- ============================================================
-- Migration 0018 — pending_email_change（改邮箱暂存表，v0.7.5）
--
-- 改邮箱流程：
--   1. /api/account/change-email-request  POST { new_email, current_password }
--      → 校验密码 + 检查 new_email 未被其他 user 占用
--      → 生成 6 位 code 写本表（PK = user_id，覆盖前面的 pending）
--      → 发邮件到 new_email
--   2. /api/account/change-email-confirm  POST { code }
--      → 校验 code → UPDATE user.email → DELETE 本行
--
-- PK 选择 user_id：保证同一 user 同时只有一个 pending 改邮箱（覆盖前面）。
-- new_email 不加 UNIQUE：竞争场景下两个 user 同时 pending 改到同一邮箱
-- 也允许 —— confirm 时谁先把 user.email UPDATE 走，另一方在 confirm 时
-- SELECT user 检查 UNIQUE 冲突 fail。
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE pending_email_change (
  user_id         TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  new_email       TEXT NOT NULL,
  code            TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  expires_at      INTEGER NOT NULL,         -- unix ms (30 min)
  created_at      TEXT NOT NULL              -- ISO 8601
);
CREATE INDEX idx_pending_email_change_expires ON pending_email_change(expires_at);
