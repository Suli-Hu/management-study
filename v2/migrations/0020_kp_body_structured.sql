-- ============================================================
-- Migration 0020 — v0.8.0 Stage 1: KP body 结构化双写过渡
--
-- 详细背景：v2/docs/KP-BODY-STRUCTURED-PRD.md
--
-- 加 5 个新列存结构化 body / evaluations。旧列暂保留（双写过渡），
-- Stage 5 (migration 0021) 才 drop 旧列。
--
-- 双写策略（PRD §6.3）：
--   - Stage 1 起所有写入路径同时写新列（buildUpsertStmt 自动跟 KP_TABLE.cols）
--   - Stage 1 backfill 一次性把存量旧列数据迁到新列
--   - Stage 2 起渲染层默认读新列，旧列降为 fallback（带 sentry 告警）
--   - Stage 5 物理 drop 旧列，切断退路
--
-- 应用：wrangler d1 migrations apply management-study-v2 --remote
-- ============================================================

-- 结构化 body JSON（参 src/schemas/kp-body-structured.ts KpBody type）
ALTER TABLE kp ADD COLUMN body_zh_json TEXT;
ALTER TABLE kp ADD COLUMN body_ja_json TEXT;

-- evaluations 6 字段独立（参 KpEvaluations type） — 中日各一份
ALTER TABLE kp ADD COLUMN evaluations_zh_json TEXT;
ALTER TABLE kp ADD COLUMN evaluations_ja_json TEXT;

-- 冗余 cache：方便 SQL 直接 filter by format（如统计各 format KP 数量）
-- 不冗余的话需要 JSON_EXTRACT(body_zh_json, '$.format')，每次都解析 JSON
ALTER TABLE kp ADD COLUMN body_format TEXT;

-- 注：新列暂时全 NULL，由 Stage 1 backfill admin endpoint 一次性填充
-- 之后所有写入路径双写，新数据进入时新旧列同步
