/**
 * Astro middleware — 每个请求读 session cookie，populate Astro.locals.user.
 *
 * + 强制登录 gate（v0.2.7 起）：除白名单外所有路径，未登录 → 302 /login
 *
 * locals.user = 完整 User 对象 | null
 */

import { defineMiddleware } from 'astro:middleware';
import { parseCookieSession, getSessionUser, isAdmin, isGuest } from '~/lib/auth';
import { getDb } from '~/lib/db';

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

export const onRequest = defineMiddleware(async (context, next) => {
  const env = context.locals.runtime?.env;
  const url = new URL(context.request.url);

  // Populate locals.user
  if (!env) {
    context.locals.user = null;
  } else {
    const sessionId = parseCookieSession(context.request.headers.get('cookie'));
    if (!sessionId) {
      context.locals.user = null;
    } else {
      try {
        const db = getDb(env);
        context.locals.user = await getSessionUser(db, sessionId);
      } catch {
        context.locals.user = null;
      }
    }
  }

  // v0.2.8: admin flag（写权限 gate 依赖这个）
  context.locals.isAdmin = isAdmin(context.locals.user, env?.ADMIN_EMAILS);

  // v0.2.9: guest flag（password 模式 GUEST_PASSWORD 登录者；未来 user_progress 写入要跳过）
  context.locals.isGuest = isGuest(context.locals.user, env?.GUEST_EMAIL);

  // Gate: 未登录 + 非公开路径 → 跳 /login
  if (!context.locals.user && !isPublicPath(url.pathname)) {
    return Response.redirect(`${url.origin}/login`, 302);
  }

  return next();
});
