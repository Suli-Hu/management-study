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

  // === CSRF Origin check（state-changing 请求） ===
  if (!isOriginAllowed(context.request, url, env?.APP_URL)) {
    return new Response('Forbidden: bad Origin', { status: 403 });
  }

  // === Auth：signed cookie → locals.user（stateless，不查 D1） ===
  const cookieValue = parseCookieSession(context.request.headers.get('cookie'));
  const secret = getSessionSecret(env?.SESSION_SECRET);
  const payload = await verifySessionCookie(cookieValue, secret);
  context.locals.user = payload ? sessionUserFromPayload(payload) : null;

  // v0.2.8: admin flag（写权限 gate 依赖这个）
  context.locals.isAdmin = isAdmin(context.locals.user, env?.ADMIN_EMAILS);

  // v0.2.9: guest flag（password 模式 GUEST_PASSWORD 登录者；未来 user_progress 写入要跳过）
  context.locals.isGuest = isGuest(context.locals.user, env?.GUEST_EMAIL);

  // Gate: 未登录 + 非公开路径 → 跳 /login
  if (!context.locals.user && !isPublicPath(url.pathname)) {
    return Response.redirect(`${url.origin}/login`, 302);
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
