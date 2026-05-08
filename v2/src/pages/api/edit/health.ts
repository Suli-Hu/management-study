/**
 * GET /api/edit/health  —— 编辑器接通自检
 *
 * v0.12.0+: decoupled / D1-first.
 *
 * admin only。验证：
 *   1. D1 binding 是否存在
 *   2. discipline 表是否可读（基础 schema 健全）
 *
 * 用途：
 *   - 编辑入口（铅笔图标）渲染前 fetch 这里，503 → 灰显 + 提示
 *   - 部署后 admin 自测，避免「编辑保存才发现 DB 没绑 / schema 不对」
 */

import type { APIRoute } from 'astro';
import type { D1Database } from '@cloudflare/workers-types';
import { docsHeaders } from '~/lib/docs';
import { jsonResWithInit } from '~/lib/json';

interface HealthOK {
  ok: true;
  db: 'd1';
  discipline_count: number;
}
interface HealthFail {
  ok: false;
  reason:
    | 'not_admin'
    | 'config_missing'
    | 'db_unreachable'
    | 'db_corrupt';
  detail?: string;
}

export const GET: APIRoute = async ({ locals }) => {
  const docs = 'https://study.sususu.org/docs/api-reference.md#95-get-apiedithealth--编辑功能自检admin';
  if (!locals.isAdmin) {
    return jsonResWithInit<HealthFail>(403, { ok: false, reason: 'not_admin' }, { headers: docsHeaders(docs) });
  }

  const env = locals.runtime.env;
  const db = env.DB as D1Database | undefined;
  if (!db) {
    return jsonResWithInit<HealthFail>(
      503,
      { ok: false, reason: 'config_missing', detail: 'D1 binding "DB" not found' },
      { headers: docsHeaders(docs) },
    );
  }

  try {
    // minimal schema check: discipline table should exist
    const row = await db
      .prepare('SELECT COUNT(*) as n FROM discipline')
      .first<{ n: number }>();
    if (!row || typeof row.n !== 'number') {
      return jsonResWithInit<HealthFail>(
        500,
        { ok: false, reason: 'db_corrupt', detail: 'discipline table returned unexpected shape' },
        { headers: docsHeaders(docs) },
      );
    }
    return jsonResWithInit<HealthOK>(200, { ok: true, db: 'd1', discipline_count: row.n }, { headers: docsHeaders(docs) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // If schema/table missing, D1 typically throws; categorize as db_corrupt.
    if (msg.toLowerCase().includes('no such table') || msg.toLowerCase().includes('sqlite')) {
      return jsonResWithInit<HealthFail>(500, { ok: false, reason: 'db_corrupt', detail: msg }, { headers: docsHeaders(docs) });
    }
    return jsonResWithInit<HealthFail>(502, { ok: false, reason: 'db_unreachable', detail: msg }, { headers: docsHeaders(docs) });
  }
};
