/**
 * Flash cookie — 短期（60s）、read-once 的 server→client 消息通道。
 *
 * v0.3.6（修 A6 + A7）：把 URL query 里的 `?error=xxx` / `?email=xxx` 换成 flash cookie，
 * 避免在 URL 栏 / 浏览器历史 / server log / Referer 里留下敏感内容。
 *
 * 设计：
 *   - 不签名（60s TTL，伪造也只能骗自己显示一条消息，无实际安全影响）
 *   - JSON payload（支持多键：error + email 同时传）
 *   - 读一次就清（页面读 flash → 顺手 set Max-Age=0）
 */

export const FLASH_COOKIE = 'flash';

/** Set-Cookie header value：写入 flash（60s 有效） */
export function buildFlashCookie(data: Record<string, string>, isProd: boolean): string {
  const encoded = encodeURIComponent(JSON.stringify(data));
  const parts = [
    `${FLASH_COOKIE}=${encoded}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=60',
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

/** Set-Cookie header value：清 flash（配合读端用） */
export function buildFlashClearCookie(isProd: boolean): string {
  const parts = [`${FLASH_COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

/** 从 Cookie header 取 flash payload（失败 → null） */
export function readFlash(cookieHeader: string | null | undefined): Record<string, string> | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const p of pairs) {
    const [k, ...rest] = p.split('=');
    if (k.trim() === FLASH_COOKIE) {
      try {
        const decoded = decodeURIComponent(rest.join('=').trim());
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // 所有值强转 string（防止 number / null 干扰）
          const out: Record<string, string> = {};
          for (const [key, val] of Object.entries(parsed)) {
            out[key] = String(val ?? '');
          }
          return out;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}
