-- ============================================================
-- Migration 0019 — share_link（学习记录 7 天公开分享链接 / v0.7.30）
--
-- 目的：用户可生成一个 7 天有效的只读分享链接，把当前学科的「学习记录」
--       展示给非系统用户（老师/导师），无需对方注册账号。
--
-- 设计决策：
--   - per (user_id, discipline) UNIQUE：每个学科只一条 active 链接，
--     重新生成 = REPLACE 旧 token（旧链接立即失效）
--   - 无 revoked_at 字段：撤销逻辑由 expires_at 统一表达。要提前撤销？
--     重新生成（覆盖）。要永久停止？不重新生成，等 7 天过期即可。
--   - SSR 渲染分享页时永远 WHERE token = ? AND expires_at > now，
--     不需要后台 cron 清理过期数据（容量小，定期 admin 手动清也行）。
--   - 不存 user.display_name 快照 — 公开页只显示「学习者 · {学科}」匿名标签，
--     不暴露用户身份。
--
-- 安全性：
--   - token = 64-byte base64url（256-bit 熵），不可枚举
--   - DB 失陷 = 全站 game over，无需对 token 二次哈希
-- ============================================================

PRAGMA foreign_keys = ON;

CREATE TABLE share_link (
  token         TEXT PRIMARY KEY,                                   -- 64B base64url
  user_id       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  discipline    TEXT NOT NULL REFERENCES discipline(key) ON DELETE CASCADE,
  scope         TEXT NOT NULL DEFAULT 'study-log',                  -- 预留扩展（其他模块也想分享时复用）
  created_at    TEXT NOT NULL,                                      -- ISO 8601
  expires_at    TEXT NOT NULL,                                      -- ISO 8601 (created_at + 7d)
  UNIQUE (user_id, discipline, scope)
);

-- 公开页 SSR 主查询：按 token 直接查
-- (PRIMARY KEY 已是 token，无需另建)

-- expires_at 索引：未来若加 cron 清理过期记录走得动
CREATE INDEX idx_share_link_expires ON share_link(expires_at);
