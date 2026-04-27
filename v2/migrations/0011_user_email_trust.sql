-- ============================================================
-- Migration 0011 — v0.5.45 邮箱 N 天免 code 信任
--
-- 用户诉求：验证过的邮箱在 EMAIL_TRUST_DAYS 内，跨任何设备输入该邮箱
-- 直接 grant session（不发 code）。安全 tradeoff：从"持有 email"降级
-- 成"知道 email 字符串"——靠 ADMIN_EMAILS 白名单收窄攻击面。
--
-- 默认 EMAIL_TRUST_DAYS=3（wrangler.toml [vars]，可调，0 关闭）。
--
-- 字段：trusted_until (unix ms)，每次验证成功 = now + N 天。
--   - NULL / 0     → 从未验证 / 已过期 → 走正常 magic link
--   - > Date.now() → 直接 grant session
--
-- 应用：wrangler d1 migrations apply management-study-v2
-- ============================================================

ALTER TABLE user ADD COLUMN trusted_until INTEGER;
