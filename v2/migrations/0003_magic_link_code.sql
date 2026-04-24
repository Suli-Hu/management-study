-- ============================================================
-- Migration 0003 — magic_link 表加 code 列（6 位数字跨设备登录）
--
-- 场景：电脑发起登录，手机收邮件点链接 → 手机登了电脑没登。
-- 解决：邮件里同时给 6 位数字 code，用户在电脑上输入 code 完成登录。
--
-- 安全：code 和 token 绑在同一 magic_link 行，任一 consume 整行 used_at
-- 置位。单用户体量 + 10 分钟过期，暴力猜 10^6 / 10min 风险可接受（未来
-- 如果开放多用户再加速率限制）。
-- ============================================================

ALTER TABLE magic_link ADD COLUMN code TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_magic_link_email_code ON magic_link(email, code);
