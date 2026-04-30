/**
 * 统一资源 sync helper (v0.5.93)
 *
 * 把 v0.5.92 的 sync-from-git logic 抽到 lib，让
 * /api/v1/sync/[type]/[disc]/[id].ts 和 /api/v1/webhook/github 都能复用。
 *
 * 不做 RBAC / GITHUB_PAT 校验 — caller 负责。
 */

import type { z } from 'zod';
import { Kp } from '~/schemas/kp';
import { School } from '~/schemas/school';
import { Scholar } from '~/schemas/scholar';
import { View } from '~/schemas/view';
import { Discipline } from '~/schemas/discipline';
import { getFile } from '~/lib/github';
import { upsertKpInD1, deleteKpInD1, withRetry } from '~/lib/d1-kp-write';
import { upsertSchoolInD1, deleteSchoolInD1 } from '~/lib/d1-school-write';
import { upsertScholarInD1, deleteScholarInD1 } from '~/lib/d1-scholar-write';
import { upsertViewInD1, deleteViewInD1 } from '~/lib/d1-view-write';
import { upsertDisciplineInD1, deleteDisciplineInD1 } from '~/lib/d1-discipline-write';

// v0.6.7: 加 'discipline' — 让 themes/tags 改动也走 sync 路径
export type ResourceType = 'kp' | 'school' | 'scholar' | 'view' | 'discipline';

// 4 种文件级资源（discipline.json 不在此表，路径特殊处理）
const TYPE_DIR: Record<Exclude<ResourceType, 'discipline'>, string> = {
  kp: 'kp',
  school: 'schools',
  scholar: 'scholars',
  view: 'views',
};

/** url path 段 → resource type，未识别返 null */
export function detectResourceFromPath(filePath: string): { type: ResourceType; discipline: string; idOrKey: string } | null {
  // discipline.json 优先匹配 — 约定 idOrKey == discipline 自身（路径无 idOrKey 段）
  const dm = filePath.match(/^v2\/data\/([^/]+)\/discipline\.json$/);
  if (dm) return { type: 'discipline', discipline: dm[1], idOrKey: dm[1] };

  const m = filePath.match(/^v2\/data\/([^/]+)\/(kp|schools|scholars|views)\/([^/]+)\.json$/);
  if (!m) return null;
  const [, discipline, dir, idOrKey] = m;
  const reverse: Record<string, ResourceType> = { kp: 'kp', schools: 'school', scholars: 'scholar', views: 'view' };
  const type = reverse[dir];
  if (!type) return null;
  return { type, discipline, idOrKey };
}

export interface SyncResult {
  ok: boolean;
  type: ResourceType;
  discipline: string;
  id_or_key: string;
  title_zh?: string;
  commit_sha?: string | null;
  reason?: string;
  detail?: unknown;
}

/** Upsert 一条资源 — 从 git 拉文件 + parse + zod + d1 write + sync_log */
export async function syncResource(
  env: { GITHUB_PAT: string; GITHUB_REPO: string; DB: D1Database },
  type: ResourceType,
  discipline: string,
  idOrKey: string,
): Promise<SyncResult> {
  const path = type === 'discipline'
    ? `v2/data/${discipline}/discipline.json`
    : `v2/data/${discipline}/${TYPE_DIR[type]}/${idOrKey}.json`;
  // retry 拉 GitHub 2 次
  let ghRes: Awaited<ReturnType<typeof getFile>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    ghRes = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
    if (ghRes.ok) break;
    if (ghRes.reason === 'not_found') break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  if (!ghRes?.ok) {
    return {
      ok: false, type, discipline, id_or_key: idOrKey,
      reason: ghRes?.reason === 'not_found' ? 'not_found_in_git' : 'github_error',
      detail: ghRes?.detail,
    };
  }

  let parsedJson: unknown;
  try { parsedJson = JSON.parse(ghRes.data.content); }
  catch (e) {
    return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'invalid_json', detail: (e as Error).message };
  }

  try {
    if (type === 'discipline') {
      const p = Discipline.safeParse(parsedJson);
      if (!p.success) return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'schema_invalid', detail: p.error.issues };
      // 约定：idOrKey == discipline 自身 key
      if (p.data.key !== idOrKey || p.data.key !== discipline) {
        return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'path_json_mismatch', detail: { key: p.data.key, expected: discipline } };
      }
      await withRetry(() => upsertDisciplineInD1(env.DB, p.data));
      await logSync(env.DB, ghRes.data.sha);
      return { ok: true, type, discipline, id_or_key: idOrKey, title_zh: p.data.title.zh, commit_sha: ghRes.data.sha };
    }
    if (type === 'kp') {
      const p = Kp.safeParse(parsedJson);
      if (!p.success) return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'schema_invalid', detail: p.error.issues };
      if (p.data.id !== idOrKey || p.data.discipline !== discipline) {
        return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'path_json_mismatch', detail: { id: p.data.id, discipline: p.data.discipline } };
      }
      await withRetry(() => upsertKpInD1(env.DB, p.data));
      await logSync(env.DB, ghRes.data.sha);
      return { ok: true, type, discipline, id_or_key: idOrKey, title_zh: p.data.title.zh, commit_sha: ghRes.data.sha };
    }
    if (type === 'school') {
      const p = School.safeParse(parsedJson);
      if (!p.success) return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'schema_invalid', detail: p.error.issues };
      if (p.data.key !== idOrKey || p.data.discipline !== discipline) {
        return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'path_json_mismatch' };
      }
      await withRetry(() => upsertSchoolInD1(env.DB, p.data));
      await logSync(env.DB, ghRes.data.sha);
      return { ok: true, type, discipline, id_or_key: idOrKey, title_zh: p.data.title.zh, commit_sha: ghRes.data.sha };
    }
    if (type === 'scholar') {
      const p = Scholar.safeParse(parsedJson);
      if (!p.success) return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'schema_invalid', detail: p.error.issues };
      if (p.data.key !== idOrKey || p.data.discipline !== discipline) {
        return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'path_json_mismatch' };
      }
      await withRetry(() => upsertScholarInD1(env.DB, p.data));
      await logSync(env.DB, ghRes.data.sha);
      return { ok: true, type, discipline, id_or_key: idOrKey, title_zh: p.data.name.zh, commit_sha: ghRes.data.sha };
    }
    // view
    const p = View.safeParse(parsedJson);
    if (!p.success) return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'schema_invalid', detail: p.error.issues };
    if (p.data.id !== idOrKey || p.data.discipline !== discipline) {
      return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'path_json_mismatch' };
    }
    await withRetry(() => upsertViewInD1(env.DB, p.data));
    await logSync(env.DB, ghRes.data.sha);
    return { ok: true, type, discipline, id_or_key: idOrKey, title_zh: p.data.name, commit_sha: ghRes.data.sha };
  } catch (e) {
    return { ok: false, type, discipline, id_or_key: idOrKey, reason: 'd1_write_failed', detail: String(e) };
  }
}

export async function deleteResource(
  env: { DB: D1Database },
  type: ResourceType,
  _discipline: string,
  idOrKey: string,
): Promise<SyncResult> {
  try {
    if (type === 'discipline') await withRetry(() => deleteDisciplineInD1(env.DB, idOrKey));
    else if (type === 'kp') await withRetry(() => deleteKpInD1(env.DB, idOrKey));
    else if (type === 'school') await withRetry(() => deleteSchoolInD1(env.DB, idOrKey));
    // v0.6.8: scholar 复合 PK，删除按 (discipline, key)
    else if (type === 'scholar') await withRetry(() => deleteScholarInD1(env.DB, _discipline, idOrKey));
    else await withRetry(() => deleteViewInD1(env.DB, idOrKey));
    await logSync(env.DB, null);
    return { ok: true, type, discipline: _discipline, id_or_key: idOrKey };
  } catch (e) {
    return { ok: false, type, discipline: _discipline, id_or_key: idOrKey, reason: 'd1_write_failed', detail: String(e) };
  }
}

async function logSync(db: D1Database, sha: string | null): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO sync_log (ran_at, commit_sha, status) VALUES (?, ?, ?)`,
    ).bind(new Date().toISOString(), sha ?? '', 'partial_sync').run();
  } catch (err) {
    console.error('[sync-resource] sync_log insert failed (non-fatal):', err);
  }
}
