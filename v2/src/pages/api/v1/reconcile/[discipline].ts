/**
 * POST /api/v1/reconcile/<discipline>  (v0.6.7)
 *
 * 对账 git vs D1 — 不修复，只报告 drift。
 *
 * 用途：
 *   - GitHub Actions schedule cron 每日触发，发现 drift → workflow fail → repo email
 *   - admin 手动跑一次确认数据一致性
 *
 * 修复方式：admin 看到 drift 后调 `POST /api/v1/sync-discipline/<discipline>` 一键拉齐。
 *   不在这里自动 sync 是有意保守 — 自动修复在 schema 异常 / 数据损坏时风险大。
 *
 * Auth: Bearer token 或 cookie，且 canEdit(discipline) = true。
 *
 * Returns 200 即使 has_drift=true（cron 看 has_drift 字段决定 workflow 成败）。
 */

import type { APIRoute } from 'astro';

interface GhListEntry { name: string; type: string; }

async function listDir(pat: string, repo: string, path: string): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; detail: string }> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=main`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'management-study-v2-reconcile',
    },
  });
  if (res.status === 404) return { ok: true, ids: [] };
  if (!res.ok) return { ok: false, status: res.status, detail: await res.text().catch(() => 'unknown') };
  const list = (await res.json()) as GhListEntry[];
  const ids = list
    .filter((e) => e.type === 'file' && e.name.endsWith('.json') && !e.name.startsWith('_template'))
    .map((e) => e.name.replace(/\.json$/, ''));
  return { ok: true, ids };
}

async function getJsonFile(pat: string, repo: string, path: string): Promise<unknown | null> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=main`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'management-study-v2-reconcile',
    },
  });
  if (!res.ok) return null;
  try { return JSON.parse(await res.text()); } catch { return null; }
}

function setDiff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

interface CollectionDrift {
  count_git: number;
  count_d1: number;
  git_only: string[];   // git 有，D1 没（漏写 / 漏 sync）
  d1_only: string[];    // D1 有，git 没（git 删了但 D1 没删）
}

function diff(gitIds: string[], d1Ids: string[]): CollectionDrift {
  const g = new Set(gitIds);
  const d = new Set(d1Ids);
  return {
    count_git: gitIds.length,
    count_d1: d1Ids.length,
    git_only: setDiff(g, d),
    d1_only: setDiff(d, g),
  };
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const POST: APIRoute = async ({ params, locals }) => {
  const discipline = params.discipline;
  if (!discipline) return json(400, { ok: false, reason: 'bad_request', detail: 'missing discipline' });
  if (!locals.user) return json(403, { ok: false, reason: 'not_authenticated' });
  if (!locals.canEdit(discipline)) return json(403, { ok: false, reason: 'no_write_permission', detail: discipline });

  const env = locals.runtime.env;
  if (!env?.GITHUB_PAT || !env?.GITHUB_REPO || !env?.DB) {
    return json(503, { ok: false, reason: 'config_missing' });
  }

  const checkedAt = new Date().toISOString();

  // 1. 列 git 4 类资源
  const [gitSchools, gitScholars, gitViews, gitKps] = await Promise.all([
    listDir(env.GITHUB_PAT, env.GITHUB_REPO, `v2/data/${discipline}/schools`),
    listDir(env.GITHUB_PAT, env.GITHUB_REPO, `v2/data/${discipline}/scholars`),
    listDir(env.GITHUB_PAT, env.GITHUB_REPO, `v2/data/${discipline}/views`),
    listDir(env.GITHUB_PAT, env.GITHUB_REPO, `v2/data/${discipline}/kp`),
  ]);

  // 2. 查 D1 4 类
  const [d1Schools, d1Scholars, d1Views, d1Kps] = await Promise.all([
    env.DB.prepare('SELECT key  FROM school   WHERE discipline = ?').bind(discipline).all<{ key: string }>(),
    env.DB.prepare('SELECT key  FROM scholar  WHERE discipline = ?').bind(discipline).all<{ key: string }>(),
    env.DB.prepare('SELECT id   FROM view     WHERE discipline = ?').bind(discipline).all<{ id: string }>(),
    env.DB.prepare('SELECT id   FROM kp       WHERE discipline = ?').bind(discipline).all<{ id: string }>(),
  ]);

  const drift = {
    schools:  diff(gitSchools.ok  ? gitSchools.ids  : [], (d1Schools.results  ?? []).map((r) => r.key)),
    scholars: diff(gitScholars.ok ? gitScholars.ids : [], (d1Scholars.results ?? []).map((r) => r.key)),
    views:    diff(gitViews.ok    ? gitViews.ids    : [], (d1Views.results    ?? []).map((r) => r.id)),
    kps:      diff(gitKps.ok      ? gitKps.ids      : [], (d1Kps.results      ?? []).map((r) => r.id)),
  };

  // 3. discipline.json 浅对账：themes 长度 + tags 长度 + updatedAt
  const gitDisc = await getJsonFile(env.GITHUB_PAT, env.GITHUB_REPO, `v2/data/${discipline}/discipline.json`);
  const d1Disc = await env.DB
    .prepare('SELECT themes_json, tags_json, updated_at FROM discipline WHERE key = ?')
    .bind(discipline)
    .first<{ themes_json: string; tags_json: string; updated_at: string }>();

  type DiscDrift = {
    git_themes_count: number;
    d1_themes_count: number;
    git_tags_count: number;
    d1_tags_count: number;
    git_updated_at: string | null;
    d1_updated_at: string | null;
    drift: boolean;
  } | { drift: false; note: string };

  let disciplineDrift: DiscDrift;
  if (!gitDisc || !d1Disc) {
    disciplineDrift = { drift: false, note: 'discipline.json missing on git or D1 — skipped (run sync-discipline first)' };
  } else {
    const g = gitDisc as { themes?: unknown[]; tags?: unknown[]; updatedAt?: string };
    let d1Themes: unknown[] = [];
    let d1Tags: unknown[] = [];
    try { d1Themes = JSON.parse(d1Disc.themes_json) as unknown[]; } catch { /* tolerate */ }
    try { d1Tags = JSON.parse(d1Disc.tags_json) as unknown[]; } catch { /* tolerate */ }
    const driftDetected =
      (g.themes?.length ?? 0) !== d1Themes.length ||
      (g.tags?.length ?? 0) !== d1Tags.length ||
      (g.updatedAt ?? null) !== (d1Disc.updated_at ?? null);
    disciplineDrift = {
      git_themes_count: g.themes?.length ?? 0,
      d1_themes_count: d1Themes.length,
      git_tags_count: g.tags?.length ?? 0,
      d1_tags_count: d1Tags.length,
      git_updated_at: g.updatedAt ?? null,
      d1_updated_at: d1Disc.updated_at ?? null,
      drift: driftDetected,
    };
  }

  const totalDrift =
    drift.schools.git_only.length + drift.schools.d1_only.length +
    drift.scholars.git_only.length + drift.scholars.d1_only.length +
    drift.views.git_only.length + drift.views.d1_only.length +
    drift.kps.git_only.length + drift.kps.d1_only.length +
    ('drift' in disciplineDrift && disciplineDrift.drift ? 1 : 0);

  const hasDrift = totalDrift > 0;

  // 4. 写 sync_log（best-effort）
  try {
    await env.DB
      .prepare('INSERT INTO sync_log (ran_at, commit_sha, status) VALUES (?, ?, ?)')
      .bind(checkedAt, '', hasDrift ? 'reconcile_drift' : 'reconcile_check')
      .run();
  } catch (logErr) {
    console.error('[reconcile] sync_log insert failed (non-fatal):', logErr);
  }

  return json(200, {
    ok: true,
    discipline,
    checked_at: checkedAt,
    has_drift: hasDrift,
    total_drift: totalDrift,
    drift: { ...drift, discipline_json: disciplineDrift },
  });
};
