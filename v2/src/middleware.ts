/**
 * Astro middleware — 每个请求读 session cookie，populate Astro.locals.user.
 *
 * locals.user = 完整 User 对象 | null
 * 页面/API route 可直接读 Astro.locals.user 判断登录态。
 */

import { defineMiddleware } from 'astro:middleware';
import { parseCookieSession, getSessionUser } from '~/lib/auth';
import { getDb } from '~/lib/db';

export const onRequest = defineMiddleware(async (context, next) => {
  const env = context.locals.runtime?.env;
  if (!env) {
    context.locals.user = null;
    return next();
  }

  const sessionId = parseCookieSession(context.request.headers.get('cookie'));
  if (!sessionId) {
    context.locals.user = null;
    return next();
  }

  try {
    const db = getDb(env);
    const user = await getSessionUser(db, sessionId);
    context.locals.user = user;
  } catch {
    context.locals.user = null;
  }

  return next();
});
