-- ============================================================
-- Migration 0004 — magic_link.attempt_count (v0.3.2 rate limit)
--
-- 目的：挡 6 位 code 暴力猜测。
--   10 分钟 × 10^6 可能 × 无限重试 = 攻击者可得手
--   改为：失败 3 次 → 强制 invalidate（used_at 置位）→ 用户必须重发
--
-- 字段：attempt_count 记录失败次数，成功 consume 时直接置 used_at
-- ============================================================

ALTER TABLE magic_link ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
