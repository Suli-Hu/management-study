-- ============================================================
-- Migration 0009 — v0.5.0 标签化重构
--
-- 旧 4 选 1 enum accent (ob/classic/strategy/warning) → 用户自定义标签库
--
-- 字段层动作：
--   1. discipline 新增 tags_json（标签库 [{key,label,color}, ...]）
--      旧 accent 列保留不动（残留死字段，下次清理 migration 再 DROP）
--   2. school 新增 tags_json（学派引用 discipline.tags 的 key 列表）
--      旧 accent 列保留
--   3. scholar 新增 tags_json
--      （scholar 之前没有 accent 列 — 0006 加过但 sync 时 v0.4.19 强制写空，新列直接加）
--   4. kp.tags_json 字段已存在，本次不改 schema；语义在 sync 层切换（义/限/例 → tag key）
--
-- 应用：wrangler d1 migrations apply management-study-v2
-- ============================================================

ALTER TABLE discipline ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE school     ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE scholar    ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
