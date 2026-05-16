-- v0.11.61 KP 日文翻译追踪字段 — 给每日自动翻译 loop 用
--
-- 语义：
--   - ja_translated_at = 上次 ja 字段被写入的时间（手动编辑或 agent 翻译）
--   - ja_zh_hash       = 写入 ja 时对应的 zh 内容 hash (SHA-256)
--
-- 自动翻译 loop 判定逻辑：
--   if locked_at != NULL                                  → 跳过（终极保护态）
--   if ja_translated_at IS NULL                            → 翻译（从未翻译）
--   if ja_zh_hash != sha256(current zh fields)            → 翻译（中文变了）
--   if now - ja_translated_at > 100 days                  → 翻译（TTL 过期，应用最新 skill 规则）
--   else                                                   → 跳过
--
-- hash 算法：sha256(body_zh_json + '|' + title_zh + '|' + (evaluations_zh_json ?? ''))
-- 由 patchKpRecord 自动维护：检测到 ja 字段在 PATCH 中变化时一并写入两个字段。

ALTER TABLE kp ADD COLUMN ja_translated_at TEXT DEFAULT NULL;
ALTER TABLE kp ADD COLUMN ja_zh_hash TEXT DEFAULT NULL;
