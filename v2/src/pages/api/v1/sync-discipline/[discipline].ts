/**
 * POST /api/v1/sync-discipline/<discipline>  (v0.6.6)
 *
 * 全学科 backfill：扫 v2/data/<discipline>/{schools,scholars,views,kp} 全部 .json 文件，
 *   依次调 syncResource → upsert 到 D1。
 *
 * 解决场景：
 *   - webhook 没配（GITHUB_WEBHOOK_SECRET 缺失），git 推送后 D1 不同步
 *   - /api/new/* 路径不双写 D1（v0.6.6 前的历史 bug），单条 sync API 一次次手动跑太烦
 *   - 跨 worktree / 跨 session 写完 git 想一键拉齐 D1
 *
 * 顺序约束：先 schools / scholars / views（被引用方） → 再 kp（kp_school / kp_scholar
 *   FK 要求 school/scholar 已存在）。同类型内部任意顺序。
 *
 * 跳过 `_template.*.json`（仅 keiei 用作 5 种 format 模板，不入 D1）。
 *
 * Auth: canEdit(discipline) — super-admin 或该学科 admin。
 */

import type { APIRoute } from 'astro';
import { syncResource, type SyncResult, type ResourceType } from '~/lib/sync-resource';

interface GhListEntry { name: string; type: string; }

async function listDir(pat: string, repo: string, path: string): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; detail: string }> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=main`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'management-study-v2-backfill',
    },
  });
  if (res.status === 404) return { ok: true, ids: [] }; // 目录不存在 = 空
  if (!res.ok) {
    return { ok: false, status: res.status, detail: await res.text().catch(() => 'unknown') };
  }
  const list = (await res.json()) as GhListEntry[];
  const ids = list
    .filter((e) => e.type === 'file' && e.name.endsWith('.json') && !e.name.startsWith('_template'))
    .map((e) => e.name.replace(/\.json$/, ''));
  return { ok: true, ids };
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

interface TypeSummary {
  total: number;
  ok: number;
  failed: number;
  errors: Array<{ id: string; reason: string; detail?: unknown }>;
}

interface DisciplineSummary {
  ok: 0 | 1;
  failed: 0 | 1;
  errors: Array<{ id: string; reason: string; detail?: unknown }>;
}

export const POST: APIRoute = async ({ params, locals }) => {
  const discipline = params.discipline;
  if (!discipline) return json(400, { ok: false, reason: 'bad_request', detail: 'missing discipline' });
  if (!locals.user) return json(403, { ok: false, reason: 'not_authenticated' });
  if (!locals.canEdit(discipline)) return json(403, { ok: false, reason: 'no_write_permission', detail: discipline });

  const env = locals.runtime.env;
  if (!env?.GITHUB_PAT || !env?.GITHUB_REPO || !env?.DB) {
    return json(503, { ok: false, reason: 'config_missing', detail: 'GITHUB_PAT / GITHUB_REPO / DB 任一未配置' });
  }
  const ghEnv = { GITHUB_PAT: env.GITHUB_PAT, GITHUB_REPO: env.GITHUB_REPO, DB: env.DB };

  // v0.6.7: 先同步 discipline.json 自己（school/scholar 的 FK parent，必须最先）
  const discResult = await syncResource(ghEnv, 'discipline', discipline, discipline);
  const discSummary: DisciplineSummary = discResult.ok
    ? { ok: 1, failed: 0, errors: [] }
    : { ok: 0, failed: 1, errors: [{ id: discipline, reason: discResult.reason ?? 'unknown', detail: discResult.detail }] };

  // 再 schools / scholars / views（被引用方），再 kp（FK 依赖前者）
  const ORDER: { type: ResourceType; dir: string; key: 'schools' | 'scholars' | 'views' | 'kps' }[] = [
    { type: 'school',  dir: 'schools',  key: 'schools' },
    { type: 'scholar', dir: 'scholars', key: 'scholars' },
    { type: 'view',    dir: 'views',    key: 'views' },
    { type: 'kp',      dir: 'kp',       key: 'kps' },
  ];

  const summary: Record<'schools' | 'scholars' | 'views' | 'kps', TypeSummary> = {
    schools:  { total: 0, ok: 0, failed: 0, errors: [] },
    scholars: { total: 0, ok: 0, failed: 0, errors: [] },
    views:    { total: 0, ok: 0, failed: 0, errors: [] },
    kps:      { total: 0, ok: 0, failed: 0, errors: [] },
  };

  for (const { type, dir, key } of ORDER) {
    const list = await listDir(env.GITHUB_PAT, env.GITHUB_REPO, `v2/data/${discipline}/${dir}`);
    if (!list.ok) {
      // 列目录失败：记一条错误但继续其它 type
      summary[key].errors.push({ id: '*', reason: 'list_dir_failed', detail: { status: list.status, detail: list.detail } });
      continue;
    }
    summary[key].total = list.ids.length;
    for (const id of list.ids) {
      const r: SyncResult = await syncResource(ghEnv, type, discipline, id);
      if (r.ok) summary[key].ok++;
      else {
        summary[key].failed++;
        summary[key].errors.push({ id, reason: r.reason ?? 'unknown', detail: r.detail });
      }
    }
  }

  const totalOk     = discSummary.ok + summary.schools.ok     + summary.scholars.ok     + summary.views.ok     + summary.kps.ok;
  const totalFailed = discSummary.failed + summary.schools.failed + summary.scholars.failed + summary.views.failed + summary.kps.failed;

  return json(200, {
    ok: true,
    discipline,
    synced_at: new Date().toISOString(),
    total_ok: totalOk,
    total_failed: totalFailed,
    summary: { discipline: discSummary, ...summary },
  });
};
