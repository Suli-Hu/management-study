/**
 * Astro middleware — 每个请求读 session cookie，populate Astro.locals.user.
 *
 * v0.3.5 起：signed cookie stateless 验证（修 A5 N+1）+ CSRF Origin check
 *
 * + 强制登录 gate（v0.2.7 起）：除白名单外所有路径，未登录 → 302 /login
 * + CSRF：state-changing method（POST/PUT/DELETE/PATCH）要求 Origin 匹配 APP_URL
 *
 * locals.user = SessionUser（cookie 解出，非 DB 查询） | null
 */

import { defineMiddleware } from 'astro:middleware';
import {
  parseCookieSession,
  verifySessionCookie,
  sessionUserFromPayload,
  getSessionSecret,
  isAdmin,
  isGuest,
  cleanupExpired,
} from '~/lib/auth';
import { getDb } from '~/lib/db';

/** v0.3.2: 每 ~1% 请求触发一次清理（概率性，无需 Cron） */
const CLEANUP_PROBABILITY = 0.01;

/** 不需要登录就能访问的路径（前缀匹配） */
const PUBLIC_PATH_PREFIXES = [
  '/login',          // 登录页 + /login/sent
  '/api/auth/',      // login / verify / verify-code / logout
  '/favicon',
  '/robots.txt',
  '/_astro/',        // 静态资源（dev + prod）
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF Origin check (v0.3.5)：state-changing 请求必须带 Origin header 且匹配 APP_URL。
 * GET / HEAD / OPTIONS 豁免（幂等）。dev 下 APP_URL 没配也允许（防本地卡住）。
 */
function isOriginAllowed(
  request: Request,
  url: URL,
  appUrl: string | undefined,
): boolean {
  if (!STATE_CHANGING_METHODS.has(request.method)) return true;
  const origin = request.headers.get('origin');
  if (!origin) return false; // 强制 Origin header
  // 允许列表：APP_URL（prod）+ 当前请求 origin（同站，覆盖 Pages preview 域名 / dev localhost）
  const allowed = new Set<string>();
  if (appUrl) allowed.add(appUrl.replace(/\/$/, ''));
  allowed.add(url.origin);
  return allowed.has(origin.replace(/\/$/, ''));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = context.locals.runtime?.env;
  const url = new URL(context.request.url);

  // v0.6.4 域名规范化：旧 management-study-v2.pages.dev → 301 study.sususu.org
  //   仅页面路径 redirect，/api/* 保留两边可用（webhook + agent token 调用）
  //   POST/PUT 等 state-changing 走 redirect 会变 GET，所以 API 不动
  if (url.host === 'management-study-v2.pages.dev' && !url.pathname.startsWith('/api/')) {
    url.host = 'study.sususu.org';
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  }

  // === CSRF Origin check（state-changing 请求） ===
  if (!isOriginAllowed(context.request, url, env?.APP_URL)) {
    return new Response('Forbidden: bad Origin', { status: 403 });
  }

  // === Auth：先 Bearer API token，再 signed cookie ===
  // v0.5.96: API token 路径 (Authorization: Bearer ms_v1_xxx)
  //   优先于 cookie，方便 agent 用 token 调 API 时不必带 cookie
  context.locals.user = null;
  context.locals.apiTokenScopes = null;
  const authHeader = context.request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ') && env?.DB) {
    const rawToken = authHeader.slice(7).trim();
    const { findValidToken } = await import('~/lib/api-token');
    const verified = await findValidToken(env.DB, rawToken);
    if (verified.ok) {
      // 从 D1 user 表查出完整 user 字段（token 没携带）
      const userRow = await env.DB
        .prepare('SELECT id, email, display_name, created_at, email_verified_at FROM user WHERE id = ?')
        .bind(verified.row.user_id)
        .first<{ id: string; email: string; display_name: string | null; created_at: string; email_verified_at: string | null }>();
      if (userRow) {
        context.locals.user = userRow;
        context.locals.apiTokenScopes = verified.scopes; // [] = 等同 user 全学科权限；否则 token 内部再收窄
      }
    }
  }
  // Cookie session fallback（如果没 Bearer 或 Bearer 无效）
  if (!context.locals.user) {
    const cookieValue = parseCookieSession(context.request.headers.get('cookie'));
    const secret = getSessionSecret(env?.SESSION_SECRET);
    const payload = await verifySessionCookie(cookieValue, secret);
    context.locals.user = payload ? sessionUserFromPayload(payload) : null;
  }

  // v0.2.8 / v0.4.25: super-admin = ADMIN_EMAILS 命中（god mode，所有学科可写）
  context.locals.isSuperAdmin = isAdmin(context.locals.user, env?.ADMIN_EMAILS);
  // 兼容字段（旧代码可能仍读 isAdmin）— 在 RBAC 改造完成前保留
  context.locals.isAdmin = context.locals.isSuperAdmin;

  // v0.2.9: guest flag（password 模式 GUEST_PASSWORD 登录者；未来 user_progress 写入要跳过）
  context.locals.isGuest = isGuest(context.locals.user, env?.GUEST_EMAIL);

  // v0.4.33: invite-code guest（共用 INVITE_GUEST_EMAIL user）
  // v0.5.74: 默认全学科 read，可由 INVITE_GUEST_DISCIPLINES 收窄到指定 discipline 集合
  const inviteEmail = env?.INVITE_GUEST_EMAIL;
  context.locals.isInviteGuest =
    !!context.locals.user && !!inviteEmail && context.locals.user.email.toLowerCase() === inviteEmail.toLowerCase();

  const inviteAllowedRaw = env?.INVITE_GUEST_DISCIPLINES?.trim() ?? '';
  const inviteAllowed = inviteAllowedRaw
    ? new Set(inviteAllowedRaw.split(',').map((s) => s.trim()).filter(Boolean))
    : null;   // null = 旧行为，全学科可读

  // v0.4.25 RBAC：load 该 user 的 per-discipline permissions（super-admin / invite-guest 跳过查询）
  context.locals.permissions = new Map();
  if (context.locals.user && env?.DB && !context.locals.isSuperAdmin && !context.locals.isInviteGuest) {
    const rows = await env.DB
      .prepare('SELECT discipline_key, role FROM user_permission WHERE user_id = ?')
      .bind(context.locals.user.id)
      .all() as { results: Array<{ discipline_key: string; role: 'admin' | 'guest' }> };
    for (const r of rows.results ?? []) {
      context.locals.permissions.set(r.discipline_key, r.role);
    }
  }
  // v0.5.96: API token scope 收窄检查 — 非空 scope = 必须在白名单内
  const tokenScopes = context.locals.apiTokenScopes;
  const tokenAllowsDiscipline = (d: string): boolean => {
    if (!tokenScopes || tokenScopes.length === 0) return true; // [] 不收窄
    return tokenScopes.includes(d);
  };

  context.locals.canEdit = (d: string | undefined) => {
    if (!d) return false;
    if (!tokenAllowsDiscipline(d)) return false;
    return context.locals.isSuperAdmin || context.locals.permissions.get(d) === 'admin';
  };
  context.locals.canRead = (d: string | undefined) => {
    if (!d) return false;
    if (!tokenAllowsDiscipline(d)) return false;
    if (context.locals.isSuperAdmin) return true;
    if (context.locals.isInviteGuest) {
      return inviteAllowed === null || inviteAllowed.has(d);
    }
    return context.locals.permissions.has(d);
  };

  // Gate: 未登录 + 非公开路径 → 跳 /login
  if (!context.locals.user && !isPublicPath(url.pathname)) {
    return Response.redirect(`${url.origin}/login`, 302);
  }

  // v0.4.25 RBAC Gate: 已登录但访问无权限学科 → 跳首页
  // 路径形如 /:discipline/...（首段被 D1 discipline 表识别为有效 key 才挡，否则当 404 让 Astro 处理）
  if (context.locals.user && !context.locals.isSuperAdmin) {
    const seg = url.pathname.split('/').filter(Boolean)[0];
    if (seg && !isPublicPath(url.pathname) && url.pathname !== '/' && env?.DB) {
      const discRow = await env.DB.prepare('SELECT 1 FROM discipline WHERE key = ?').bind(seg).first();
      if (discRow && !context.locals.canRead(seg)) {
        return Response.redirect(`${url.origin}/`, 302);
      }
    }
  }

  // v0.3.2: 概率性 cleanup 过期 magic_link（session 表 v0.3.5 起不再写入，但老行清一清）
  // fire-and-forget：不阻塞当前响应；失败 silently 记 log
  if (env && Math.random() < CLEANUP_PROBABILITY) {
    cleanupExpired(getDb(env))
      .then(({ sessions, magicLinks }) => {
        if (sessions + magicLinks > 0) {
          console.log(`[cleanup] removed ${sessions} sessions + ${magicLinks} magic_links`);
        }
      })
      .catch((err) => console.error('[cleanup] failed', err));
  }

  return next();
});
