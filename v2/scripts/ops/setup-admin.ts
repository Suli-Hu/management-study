/**
 * Setup super-admin password (v0.7.1)
 *
 * 给 ADMIN_EMAILS 命中的 super-admin 用户写入 password_hash + salt。
 * 跑这个脚本之前要先把 migration 0017 应用过（password_hash 列存在）。
 *
 * 用法（在 v2/ 目录下）：
 *
 *   # 1. 应用 migration 到本地或远程 D1
 *   pnpm exec wrangler d1 migrations apply management-study-v2 --local
 *
 *   # 2. 把密码 export 到 env（密码值不进 git）
 *   export ADMIN_PASSWORD='你的密码'
 *
 *   # 3. 跑 setup（默认 --local）
 *   pnpm setup:admin
 *   # 或远程
 *   pnpm setup:admin -- --remote
 *
 *   # 4. unset env，避免 shell history 留痕
 *   unset ADMIN_PASSWORD
 *
 * 行为：
 *   - 读 env.ADMIN_PASSWORD，强度校验
 *   - 默认 super-admin email = ADMIN_EMAILS 第一个；或 --email=xxx@x.com 覆盖
 *   - 如 user 不存在：INSERT 新行（id 自动 nanoid 风格）
 *   - 如 user 存在：UPDATE password_hash + password_changed_at（不动其他字段）
 *
 * 安全：
 *   - 密码值只通过 env 传入，不落 stdout、不落 commit、不进 wrangler logs
 *   - 哈希后即丢弃明文，写库的是 PBKDF2 hex
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, checkPasswordStrength } from '../../src/lib/password';

const __dirname = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = resolve(__dirname, '..', '..');
const TMP_DIR = join(V2_ROOT, '.wrangler', 'setup-admin');

const DB_NAME = process.env.D1_DATABASE_NAME ?? 'management-study-v2';

const args = process.argv.slice(2);
const mode = args.includes('--remote') ? '--remote' : '--local';
const emailArg = args.find((a) => a.startsWith('--email='));

const password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.error('✗ ADMIN_PASSWORD env not set. Example:');
  console.error("    export ADMIN_PASSWORD='your-password'");
  console.error('    pnpm setup:admin');
  process.exit(1);
}

const strength = checkPasswordStrength(password);
if (!strength.ok) {
  console.error(`✗ Password too weak: ${strength.message}`);
  process.exit(1);
}

// ============================================================
// 解析 super-admin email
// ============================================================

function getAdminEmail(): string {
  if (emailArg) {
    return emailArg.split('=')[1].trim().toLowerCase();
  }
  // 从 wrangler.toml 读 ADMIN_EMAILS 第一个
  const wranglerPath = join(V2_ROOT, 'wrangler.toml');
  const txt = readFileSync(wranglerPath, 'utf-8');
  const m = txt.match(/^\s*ADMIN_EMAILS\s*=\s*"([^"]+)"/m);
  if (!m) {
    console.error('✗ Could not find ADMIN_EMAILS in wrangler.toml. Pass --email=xxx@x.com explicitly.');
    process.exit(1);
  }
  const first = m[1].split(',')[0]?.trim().toLowerCase();
  if (!first) {
    console.error('✗ ADMIN_EMAILS in wrangler.toml is empty.');
    process.exit(1);
  }
  return first;
}

const email = getAdminEmail();

// ============================================================
// D1 IO
// ============================================================

function runWranglerSql(sql: string): { stdout: string; status: number } {
  mkdirSync(TMP_DIR, { recursive: true });
  const tmpFile = join(TMP_DIR, `q-${Date.now()}.sql`);
  writeFileSync(tmpFile, sql);
  try {
    const res = spawnSync(
      'pnpm',
      ['exec', 'wrangler', 'd1', 'execute', DB_NAME, mode, '--json', `--file=${tmpFile}`],
      { cwd: V2_ROOT, encoding: 'utf-8' },
    );
    return { stdout: res.stdout ?? '', status: res.status ?? 1 };
  } finally {
    try { rmSync(tmpFile); } catch { /* ignore */ }
  }
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
}

function findUser(email: string): UserRow | null {
  const escaped = email.replace(/'/g, "''");
  const { stdout, status } = runWranglerSql(
    `SELECT id, email, password_hash FROM user WHERE email = '${escaped}' LIMIT 1;`,
  );
  if (status !== 0) {
    console.error(stdout);
    throw new Error(`SELECT user failed (mode=${mode}). Has migration 0017 applied?`);
  }
  const parsed = JSON.parse(stdout);
  const results = parsed?.[0]?.results ?? [];
  return results[0] ?? null;
}

/** 简陋 nanoid（16 chars, base62）—— 跟 v2 现有 generateToken(12) 长度近似 */
function genUserId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function insertUser(email: string, hash: string, salt: string): string {
  const id = genUserId();
  const now = new Date().toISOString();
  const escaped = email.replace(/'/g, "''");
  const { stdout, status } = runWranglerSql(`
    INSERT INTO user (
      id, email, display_name, created_at, email_verified_at,
      password_hash, password_salt, password_changed_at
    ) VALUES (
      '${id}', '${escaped}', NULL, '${now}', '${now}',
      '${hash}', '${salt}', '${now}'
    );
  `);
  if (status !== 0) {
    console.error(stdout);
    throw new Error('INSERT user failed');
  }
  return id;
}

function updateUserPassword(userId: string, hash: string, salt: string): void {
  const now = new Date().toISOString();
  const { stdout, status } = runWranglerSql(`
    UPDATE user
    SET password_hash = '${hash}',
        password_salt = '${salt}',
        password_changed_at = '${now}',
        failed_attempts = 0,
        locked_until = NULL
    WHERE id = '${userId}';
  `);
  if (status !== 0) {
    console.error(stdout);
    throw new Error('UPDATE user password failed');
  }
}

// ============================================================
// main
// ============================================================

async function main() {
  console.log(`=== setup-admin (mode=${mode}, email=${email}) ===`);

  console.log('Hashing password (PBKDF2 100k rounds)...');
  const { hash, salt } = await hashPassword(password!);

  const existing = findUser(email);
  if (existing) {
    console.log(`User exists: ${existing.id}`);
    if (existing.password_hash) {
      console.log('  ⚠  Existing password_hash will be overwritten');
    }
    updateUserPassword(existing.id, hash, salt);
    console.log(`✓ Password updated for ${email} (user_id=${existing.id})`);
  } else {
    const id = insertUser(email, hash, salt);
    console.log(`✓ User created: ${email} (user_id=${id})`);
  }

  console.log('');
  console.log('Done. Now you can log in with:');
  console.log(`  email:    ${email}`);
  console.log('  password: <ADMIN_PASSWORD env value>');
  console.log('');
  console.log('Remember to: unset ADMIN_PASSWORD');
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
