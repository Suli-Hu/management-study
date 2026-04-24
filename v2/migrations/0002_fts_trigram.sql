-- ============================================================
-- Migration 0002 — FTS5 tokenizer: unicode61 → trigram
--
-- 原因：
--   unicode61 把 CJK 字块按空白分词，中文没有空白 → "双元组织" 是单个 token，
--   查询 "双元" / "组织" 都命中不了。trigram 按 3 字符滑窗分词，对 CJK 天然友好
--   （代价：短于 3 字符的查询走不了 FTS，由 UI 层 LIKE 回退）。
--
-- 安全：kp_fts 表数据每次 sync 重建，这里 DROP + CREATE 不丢任何真实数据
--   （用户表 user/user_progress 等完全不受影响）。
-- ============================================================

DROP TABLE IF EXISTS kp_fts;

CREATE VIRTUAL TABLE kp_fts USING fts5(
  id UNINDEXED,
  title_zh,
  title_en,
  title_ja,
  body_zh,
  body_ja,
  tokenize = 'trigram'
);
