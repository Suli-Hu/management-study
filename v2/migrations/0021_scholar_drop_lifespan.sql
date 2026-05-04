-- v0.8.9 Stage 4.6 Q1=B: scholar.lifespan 字段删除（schema breaking）。
--
-- 用户偏好不留历史垃圾（minimalism 第 5 次贯彻）— 直接 DROP，不保留兼容字段。
-- 现有 lifespan 数据由 admin endpoint POST /api/admin/migrate-scholar-lifespan
-- 在 deploy 前手动跑一次：split 范围分隔符 → born/died，dirty list 单独修。
--
-- SQLite 3.35+ 支持 ALTER TABLE DROP COLUMN。
-- D1 (SQLite 3.40+) + better-sqlite3 12.9 + Workers runtime 都支持。

ALTER TABLE scholar DROP COLUMN lifespan;
