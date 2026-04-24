-- ============================================================
-- Migration 0005 — user_note.kp_id FK：CASCADE → SET NULL  (修 A2)
--
-- 背景：
--   scripts/sync-to-d1.ts 原来 wipe-and-reload (DELETE FROM kp; INSERT ...),
--   FK ON DELETE CASCADE 导致 user_note 跟着被清空 —— 用户笔记丢失。
--
-- 修复组合（v0.3.4 同一 patch 内）：
--   1. sync-to-d1 改增量 upsert（ON CONFLICT DO UPDATE），不再 wipe KP 表 → 常规 sync 不触发 cascade
--   2. 本 migration 把 user_note.kp_id FK 改 SET NULL + 允许 NULL
--      → 即使真有 KP 被 learning 删除触发 cascade，笔记也保留（kp_id = NULL）
--
-- SQLite 不支持 ALTER TABLE 改 FK，只能 recreate 表。
-- ============================================================

PRAGMA foreign_keys = OFF;

CREATE TABLE user_note_new (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kp_id              TEXT REFERENCES kp(id) ON DELETE SET NULL,  -- nullable + SET NULL (was NOT NULL + CASCADE)
  body               TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

INSERT INTO user_note_new (id, user_id, kp_id, body, created_at, updated_at)
SELECT id, user_id, kp_id, body, created_at, updated_at FROM user_note;

DROP TABLE user_note;
ALTER TABLE user_note_new RENAME TO user_note;
CREATE INDEX idx_user_note_user_kp ON user_note(user_id, kp_id);

PRAGMA foreign_keys = ON;
