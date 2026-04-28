/**
 * API Token 生成 / 验证 (v0.5.96)
 *
 * Token 字符串格式: `ms_v1_<32 hex chars>` (38 chars total)
 *   - 前缀 `ms_v1_` 便于 grep / 识别
 *   - 16 字节随机 = 128 bit 熵，足够防爆破
 *
 * Storage: 只存 SHA-256(token) hash 到 D1。明文只在创建时一次性返。
 *
 * 验证: 中间件接收 `Authorization: Bearer ms_v1_xxx` → SHA-256 → 查表 → 找 user → set locals.user.
 */

const TOKEN_PREFIX = 'ms_v1_';
const TOKEN_RANDOM_BYTES = 16;

/** 生成新 token: { plain, hash, id } — 调用方存 hash，明文只在创建时返用户。 */
export async function generateToken(): Promise<{ plain: string; hash: string }> {
  const bytes = new Uint8Array(TOKEN_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const plain = `${TOKEN_PREFIX}${hex}`;
  const hash = await sha256Hex(plain);
  return { plain, hash };
}

/** SHA-256 → hex string */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 校验 token 字符串格式（不查 D1，仅静态结构检查） */
export function looksLikeToken(s: string): boolean {
  return s.startsWith(TOKEN_PREFIX) && /^ms_v1_[a-f0-9]{32}$/.test(s);
}

/** 短 token id 给 D1 主键用（10 chars，UUID-ish） */
export function generateTokenId(): string {
  const bytes = new Uint8Array(7);
  crypto.getRandomValues(bytes);
  return 't_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

interface ApiTokenRow {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  scopes_json: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

/**
 * 用 raw token 字符串查 D1 验证。失败原因：not_found / revoked / expired。
 * 成功返 row + 解析过的 scopes 数组。Best-effort 更新 last_used_at（不阻塞返回）。
 */
export async function findValidToken(
  db: D1Database,
  rawToken: string,
): Promise<{ ok: true; row: ApiTokenRow; scopes: string[] } | { ok: false; reason: 'not_found' | 'revoked' | 'expired' }> {
  if (!looksLikeToken(rawToken)) return { ok: false, reason: 'not_found' };
  const hash = await sha256Hex(rawToken);
  const row = await db
    .prepare('SELECT * FROM api_token WHERE token_hash = ?')
    .bind(hash)
    .first<ApiTokenRow>();
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.expires_at && row.expires_at < new Date().toISOString()) return { ok: false, reason: 'expired' };

  // best-effort 更新 last_used_at —— 失败不阻断
  db.prepare('UPDATE api_token SET last_used_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), row.id)
    .run()
    .catch((e) => console.error('[api-token] last_used_at update failed:', e));

  let scopes: string[] = [];
  try { scopes = JSON.parse(row.scopes_json) as string[]; } catch { /* fall back to empty */ }

  return { ok: true, row, scopes };
}

export type { ApiTokenRow };
