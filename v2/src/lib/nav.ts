/**
 * 返回链接 / 编辑入口 helper (v0.4.16)
 *
 * 模式：所有「编辑/新建/删除」入口 link 都附 `?from=<encoded current pathname>`，
 * 编辑页解析后用于：
 *   1. 顶部 ← 返回 X 链接
 *   2. 保存/完成 redirect
 *   3. 取消 redirect
 * 删除走另一规则：跳父级集合（防 404 detail page）。
 */

/** 给 target URL 附 ?from=encoded(currentPath)。currentPath 为空时不加。 */
export function editHref(target: string, currentPath?: string | URL): string {
  if (!currentPath) return target;
  const path = typeof currentPath === 'string' ? currentPath : currentPath.pathname + currentPath.search;
  const sep = target.includes('?') ? '&' : '?';
  return `${target}${sep}from=${encodeURIComponent(path)}`;
}

/**
 * 解析 ?from= 并校验：
 *   - 必须以 / 开头（同源相对路径）
 *   - 不能含 // 或 \\（防 protocol-relative URL 钓鱼）
 *   - 必须命中白名单 prefix（discipline 路由）
 *
 * 不安全 / 缺失 → 返回 fallback。
 */
const SAFE_PATH_RE = /^\/[a-z][a-z0-9_]*(?:\/.*)?$/i;

export function parseFrom(rawFrom: string | null | undefined, fallback: string): string {
  if (!rawFrom) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawFrom);
  } catch {
    return fallback;
  }
  if (decoded.includes('//') || decoded.includes('\\') || decoded.startsWith('//')) return fallback;
  if (!SAFE_PATH_RE.test(decoded)) return fallback;
  return decoded;
}

/** 用于 ← 返回 X 链接的 label，从 path 启发式推断。 */
export function fromLabel(path: string): string {
  // /keiei → 学派全览
  // /keiei/scholars → 学者列表
  // /keiei/kp → 知识点列表
  // /keiei/<school> → 学派
  // /keiei/scholars/<key> → 学者
  // /keiei/kp/<id> → 知识点
  const parts = path.split('?')[0].split('/').filter(Boolean);
  if (parts.length === 0) return '首页';
  if (parts.length === 1) return '学派全览';
  if (parts[1] === 'scholars') {
    return parts.length === 2 ? '学者列表' : '学者';
  }
  if (parts[1] === 'kp') {
    return parts.length === 2 ? '知识点列表' : '知识点';
  }
  return '学派';
}
