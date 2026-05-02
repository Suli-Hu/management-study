-- ============================================================
-- Migration 0016 — study_session（学习记录 L5 用户私有数据层）
--
-- 学习记录模块（PRD v1.0，2026-05-02）的存储层。
-- 每条 study_session 是一次"学了某个 KP 多久"的记录，用于：
--   - 日志流视图（按日期分组）
--   - 知识点排行（按 kp_id 聚合）
--   - 学派段位（按 KP.schools[0] 聚合，配合 lib/tier.ts 算分）
--
-- 设计决策对齐：
--   - 不存 school 快照、不存 score。段位与归属实时按 KP 当前 schools[0] 算
--     （lib/tier.ts 纯函数 + 前端聚合）。E1：接受 KP 改主学派后历史段位变化。
--   - kp_id 用 ON DELETE SET NULL（参考 0005 user_note FK 修复，A2 教训：
--     避免 sync wipe-and-reload 误删用户数据）。
--   - discipline 列与现有 user_progress / user_note 不一样，显式存储而非
--     从 kp join 推断，便于 per-discipline 列表查询走索引。
--
-- 名字注意：avoid `session` 冲突（auth session 表已占用）。
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE study_session (
  id              TEXT PRIMARY KEY,                                 -- nanoid
  user_id         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  discipline      TEXT NOT NULL REFERENCES discipline(key) ON DELETE CASCADE,
  kp_id           TEXT REFERENCES kp(id) ON DELETE SET NULL,        -- nullable: KP 删除后保留 session
  date            TEXT NOT NULL,                                    -- YYYY-MM-DD（用户时区）
  start_time      TEXT NOT NULL,                                    -- HH:mm
  duration_min    INTEGER NOT NULL CHECK (duration_min BETWEEN 1 AND 600),
  rating          INTEGER CHECK (rating BETWEEN 1 AND 5),           -- 自评 1-5，可空
  note            TEXT,                                             -- 单段心得，可空
  created_at      TEXT NOT NULL,                                    -- ISO 8601
  updated_at      TEXT NOT NULL                                     -- ISO 8601
);

-- 列表 / 日志流：按用户 + 学科 + 日期倒序
CREATE INDEX idx_study_session_user_disc_date
  ON study_session(user_id, discipline, date DESC);

-- 知识点排行 / KP 聚合：按用户 + KP
CREATE INDEX idx_study_session_user_kp
  ON study_session(user_id, kp_id);
