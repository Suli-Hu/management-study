-- ============================================================
-- Migration 0024 — study_session.school_key（学派维度记账）
--
-- 允许「只记学派、不绑 KP」：kp_id 与 school_key 互斥，由应用层校验。
-- 存量行仅 kp_id；新 UI 默认写 school_key + kp_id NULL。
-- ============================================================

PRAGMA foreign_keys = ON;

ALTER TABLE study_session ADD COLUMN school_key TEXT;

-- 按用户 + 学派聚合（段位 / 统计）
CREATE INDEX idx_study_session_user_disc_school
  ON study_session(user_id, discipline, school_key);
