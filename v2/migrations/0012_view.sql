-- ============================================================
-- Migration 0012 — v0.5.66 视图系统
--
-- 引入 View 概念：学派列表页的"看法"（Notion view / Linear filter）。
-- 视图决定学派如何分组/排序/是否进入；不动学派本体。
--
-- 数据流：
--   v2/data/<discipline>/views/<id>.json (Zod schema = src/schemas/view.ts)
--   ↓ sync-to-d1 wipe-reload (与 kp_school 等关联表一致)
--   view 表
--   ↓ 学派列表页 SSR 读
--   渲染
--
-- 应用：wrangler d1 migrations apply management-study-v2
-- ============================================================

CREATE TABLE view (
  id            TEXT NOT NULL,
  discipline    TEXT NOT NULL REFERENCES discipline(key) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  jp            TEXT NOT NULL DEFAULT '',
  icon          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  flow          TEXT NOT NULL DEFAULT '',                 -- 演进主线（说明区下方小字）
  scope         TEXT NOT NULL DEFAULT 'public',           -- v0.5.66 仅 public
  kind          TEXT NOT NULL DEFAULT 'manual',           -- v0.5.66 仅 manual
  is_default    INTEGER NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0,
  groups_json   TEXT NOT NULL DEFAULT '[]',               -- ViewGroup[] JSON 串
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (id, discipline)
);

CREATE INDEX idx_view_by_discipline ON view(discipline, position);
CREATE INDEX idx_view_default       ON view(discipline, is_default DESC);
