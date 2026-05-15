-- v0.11.58 KP 锁功能 — kp 表加 locked_at / locked_by 字段
--
-- 语义：
--   - locked_at = NULL  → 未锁，正常 PATCH / DELETE / batch
--   - locked_at != NULL → 已锁，所有写路径 422 拒绝
--   - locked_by = 当时点锁的 user id（audit）
--
-- 锁切换走专用 endpoint POST/DELETE /api/kps/:id/lock，不通过通用 PATCH，
-- 避免 lock 字段被普通编辑请求误改。

ALTER TABLE kp ADD COLUMN locked_at TEXT DEFAULT NULL;
ALTER TABLE kp ADD COLUMN locked_by TEXT DEFAULT NULL;
