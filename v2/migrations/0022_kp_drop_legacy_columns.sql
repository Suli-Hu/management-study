-- v0.8.10 Stage 5: drop legacy KP columns（Stage 0-4 双轨过渡期残留）。
--
-- v0.8.0 起：写入 contract = KpBody 结构化 union；hard cut 已 12 天，调用方都已切。
-- v0.8.1-v0.8.9 期间为兼容 GET response shape，旧列继续双写但新写入路径主读新列。
-- Stage 5 拆双轨：旧列物理 drop（PRD §6.3 防线 3），切断退路。
--
-- 同步代码改动（v0.8.10）：
--   - kp-api-store.ts / kp-batch-store.ts / d1-kp-write.ts / sync-to-d1.ts
--     INSERT/UPDATE 不再写入这 5 列（KP_TABLE.cols 已删）
--   - GET response shape 切 v0.8（body: KpBody, evaluations 改名, 顶层 format 删）
--   - 3 .astro 页面 SELECT 改读新列（body_zh_json / body_format / evaluations_*_json）
--
-- 注意：kp_fts 表的 body_zh / body_ja 列保留 — 这些是 FTS5 索引字段，
-- 由 sync-to-d1.ts 用 structuredToSearchText(body) 派生纯文本写入。

ALTER TABLE kp DROP COLUMN body_zh;
ALTER TABLE kp DROP COLUMN body_ja;
ALTER TABLE kp DROP COLUMN format;
ALTER TABLE kp DROP COLUMN eval_content_zh_json;
ALTER TABLE kp DROP COLUMN eval_content_ja_json;
