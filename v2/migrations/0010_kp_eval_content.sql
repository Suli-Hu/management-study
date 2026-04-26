-- ============================================================
-- Migration 0010 — KP 评价内容结构化（v0.5.1 准备 / Phase 1 设计稿落地）
--
-- 旧：评价（义/限/例/应/用/喻）混在 kp.body_zh / body_ja 末尾
--     形如 `…◆意义—…◆局限—…◆例子—…`
-- 新：抽离到结构化字段 eval_content_json（JSON object：glyph → text）
--
-- 字段层动作：
--   1. kp 表新增 eval_content_zh_json / eval_content_ja_json 两列（中日各一份）
--      默认 '{}'。读路径如果非空就直接用；body_xx 字段经迁移后不再含评价段。
--
-- 配套：
--   - scripts/extract-eval-from-body.ts 一次性脚本（先 dry-run，spot-check 后 apply）
--   - 迁移完成后所有 body_xx 都被改写（评价段 strip 掉）
--   - 运行时不再依赖 extractEvalTags 兜底
--
-- 应用：wrangler d1 migrations apply management-study-v2
-- ============================================================

ALTER TABLE kp ADD COLUMN eval_content_zh_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE kp ADD COLUMN eval_content_ja_json TEXT NOT NULL DEFAULT '{}';
