-- v0.4.25 切回 email 模式 + 30 天勾选传递
-- magic_link 表加 remember 列：login.ts 写入 → consumeMagicLink 读出 → verify.ts 用此决定 session cookie 寿命
ALTER TABLE magic_link ADD COLUMN remember INTEGER NOT NULL DEFAULT 1;
