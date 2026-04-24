-- ============================================================
-- Migration 0006 — scholar 字段 100% 对齐 v1（v0.3.12）
--
-- v1 Main/data.js SCHOLARS 有：born / died / nationality / flag / origin /
--   field (领域 badge) / accent (hex 色)。v2 初版 migrate 只抓了 name/contribution/schools，
--   导致详情页看不出学者的 OB/SM/OT 归属。
-- 本 migration 纯 additive（不动已有列），配合 migrate-from-v1 重跑一次填回。
-- ============================================================

ALTER TABLE scholar ADD COLUMN born TEXT;
ALTER TABLE scholar ADD COLUMN died TEXT;
ALTER TABLE scholar ADD COLUMN nationality TEXT;
ALTER TABLE scholar ADD COLUMN flag TEXT;
ALTER TABLE scholar ADD COLUMN origin TEXT;
ALTER TABLE scholar ADD COLUMN field TEXT;
ALTER TABLE scholar ADD COLUMN accent TEXT;
