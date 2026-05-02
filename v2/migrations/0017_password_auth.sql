-- ============================================================
-- Migration 0017 — Password auth foundation (v0.7.1)
--
-- 完整账户系统重做。把现有 magic-link / 邀请码 / password-mode 三种登录路径
-- 统一升级为 "邮箱+密码" 主路径，magic-link 仅保留作 password reset 的载体。
--
-- 决策对齐（PRD v0.7）：
--   D1: 邀请码 123 入口保留（演示通道）
--   D2: 删除日常 magic-link 登录 → 只走 email+password；reset 流仍发邮件链接
--   D3: 开放注册（任何邮箱可 /signup），默认 0 权限（home 页学科卡片置灰）
--   D4: super-admin 用 setup-admin 脚本 INSERT password_hash（密码值不进 git）
--   D5: 不做 OAuth
--
-- 算法：
--   - PBKDF2-SHA256, 100,000 轮, 16-byte salt → 32-byte key (hex 64 字符)
--   - WebCrypto 原生支持，无 WASM 依赖
--   - scrypt/argon2id 在 CF Workers 需要 WASM，权衡后选 PBKDF2
--
-- 不删的列：
--   - user.trusted_until（v0.5.45 EMAIL_TRUST_DAYS）—— 代码停止读写，列保留以备回滚
--   - magic_link 表 —— password_reset 流仍可能复用类似机制；保留 schema
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- user 表扩展 6 列（密码 + 安全计数）
-- ============================================================

-- PBKDF2 hash（hex, 64 字符 = 32 字节 derived key）。NULL = 老用户尚未设密码。
ALTER TABLE user ADD COLUMN password_hash      TEXT;

-- PBKDF2 salt（base64url, 22 字符 = 16 字节）
ALTER TABLE user ADD COLUMN password_salt      TEXT;

-- ISO 8601。改密 / 重置时刷新；用于强制改密窗口（W6 SaaS 化时启用）
ALTER TABLE user ADD COLUMN password_changed_at TEXT;

-- ISO 8601。每次登录成功刷新；UI 在 settings 显示
ALTER TABLE user ADD COLUMN last_login_at      TEXT;

-- 连续登录失败计数；成功登录归零；≥ 5 时锁定
ALTER TABLE user ADD COLUMN failed_attempts    INTEGER NOT NULL DEFAULT 0;

-- unix ms。NULL = 未锁；> now 表示锁定中（连续失败 5 次后锁 30 分钟）
ALTER TABLE user ADD COLUMN locked_until       INTEGER;

CREATE INDEX idx_user_locked ON user(locked_until) WHERE locked_until IS NOT NULL;

-- ============================================================
-- pending_signup —— 注册暂存（验证邮箱 code 通过前不写 user 表）
-- ============================================================
--
-- 流程：
--   1. /signup 提交 email + password → 服务端 hash → 写本表 + 发邮箱 6 位 code
--   2. 用户输 code → 服务端校验 → 把本行 promote 到 user 表 → 删本行
--   3. 30 分钟未确认 → 过期，清理（被概率性 cleanup 删）
--
-- 不直接写 user 表的原因：避免"注册了但没验证"的僵尸 user 占用 email 唯一约束，
-- 也避免恶意用户用受害者 email 抢注后让真主人无法注册。

CREATE TABLE pending_signup (
  email           TEXT PRIMARY KEY,                 -- 同一 email 后到的 signup 覆盖前面
  password_hash   TEXT NOT NULL,
  salt            TEXT NOT NULL,
  display_name    TEXT,                             -- 注册时可选填，否则 NULL→email 前缀
  code            TEXT NOT NULL,                    -- 6 位数字
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  expires_at      INTEGER NOT NULL,                 -- unix ms
  created_at      TEXT NOT NULL                     -- ISO 8601
);
CREATE INDEX idx_pending_signup_expires ON pending_signup(expires_at);

-- ============================================================
-- password_reset —— 忘记密码 token
-- ============================================================
--
-- 流程：
--   1. /password-reset/request POST email → 不论 user 是否存在统一回执
--      （存在则发 reset link 含 token；不存在静默丢弃，防 email enumeration）
--   2. 用户点链接 → /password-reset?token=xxx → 设新密码
--   3. consume token + 改 user.password_hash + DELETE 该 user 所有 session（防被盗 cookie）
--
-- 跟 magic_link 表分开：语义清晰（设密码 vs 登录）+ 字段不同。

CREATE TABLE password_reset (
  token        TEXT PRIMARY KEY,                    -- 32 byte URL-safe base64
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,                    -- unix ms (30 min)
  used_at      TEXT,                                -- ISO 8601, NULL = 未使用
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_password_reset_user ON password_reset(user_id);
CREATE INDEX idx_password_reset_expires ON password_reset(expires_at);
