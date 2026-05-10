-- ============================================================
-- Migration 0025 — 将旧版「绑 KP」的学习记录改为「绑主学派」
--
-- 前提：已执行 0024（存在 study_session.school_key）。
-- 规则：取该 KP 在 kp_school 中 position 最小的一条作为主学派（与 tier / SSR 一致），
--       写入 school_key，并置 kp_id = NULL。
-- 跳过：kp_id 已空、或 KP 无任何 kp_school 关联（保持原行，避免写脏数据）。
-- ============================================================

PRAGMA foreign_keys = ON;

UPDATE study_session
SET
  school_key = (
    SELECT ks.school_key
    FROM kp_school ks
    WHERE ks.kp_id = study_session.kp_id
    ORDER BY ks.position ASC
    LIMIT 1
  ),
  kp_id = NULL
WHERE kp_id IS NOT NULL
  AND school_key IS NULL
  AND EXISTS (
    SELECT 1
    FROM kp_school ks
    WHERE ks.kp_id = study_session.kp_id
  );
