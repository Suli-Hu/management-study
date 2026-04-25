/**
 * GET /api/sync-status — 最近一次 sync→D1 的时间（v0.4.22 Pack C M5）
 *
 * 用途：编辑器保存后前端 polling，等待"deploy + sync 已完成"信号 →
 *        从 "✓ commit abc1234，~90s 后生效" 升级到实时进度。
 *
 * 公开（无需 admin），轻量（一次 ORDER BY DESC LIMIT 1）。
 *
 * 返：{ latest_ran_at: ISO | null, latest_commit_sha: string | null }
 *      前端比对 latest_ran_at > saved_at，true 即部署已完成。
 */

import type { APIRoute } from 'astro';
import { getDb } from '~/lib/db';

export const GET: APIRoute = async ({ locals }) => {
  const db = getDb(locals.runtime.env);
  const row = await db
    .prepare('SELECT ran_at, commit_sha FROM sync_log ORDER BY id DESC LIMIT 1')
    .first() as { ran_at: string; commit_sha: string } | null;

  return new Response(
    JSON.stringify({
      latest_ran_at: row?.ran_at ?? null,
      latest_commit_sha: row?.commit_sha ?? null,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      },
    },
  );
};
