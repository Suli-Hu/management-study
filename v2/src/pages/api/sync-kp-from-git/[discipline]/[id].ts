/**
 * POST /api/sync-kp-from-git/:discipline/:id  (v0.5.92)
 *
 * 用途：让走 git path 的 agent（learning / 任意 worktree）push 完后立即调一下，
 *       把 git 上的 KP 内容直写 D1，让线上 ~3s 生效。不再等 GH Actions 的 90s。
 *
 * 流程：
 *   1. admin gate (locals.canEdit(discipline))
 *   2. 从 GitHub Contents API getFile v2/data/<discipline>/kp/<id>.json
 *      （如果 push 后立刻调，GH API 已能读到最新；偶发延迟 retry 一次）
 *   3. parse + zod 校验
 *   4. upsertKpInD1（同 v0.5.89 编辑 API 那条路径）
 *   5. 返详细 payload — kp_id / title / commit_sha / public_url / d1_synced_at
 *
 * 设计目的：让 agent CLI 端能拿到清晰的成功反馈给用户看（"k628 已上线"）。
 *
 * 与 /api/edit/kp/[id] 区别：
 *   - 那个：写 git + 写 D1（API 包办）
 *   - 这个：git 已经被 agent 写好了，仅做 D1 sync
 */

import type { APIRoute } from 'astro';
import { Kp } from '~/schemas/kp';
import { getFile } from '~/lib/github';
import { upsertKpInD1, withRetry } from '~/lib/d1-kp-write';

interface SuccessBody {
  ok: true;
  kp_id: string;
  discipline: string;
  title_zh: string;
  commit_sha: string | null;
  d1_synced_at: string;
  public_url: string;
}
interface ErrorBody {
  ok: false;
  reason:
    | 'not_admin'
    | 'config_missing'
    | 'bad_request'
    | 'not_found_in_git'
    | 'schema_invalid'
    | 'd1_write_failed'
    | 'github_error';
  detail?: unknown;
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ params, locals }) => {
  const { discipline, id } = params;
  if (!discipline || !id) {
    return json<ErrorBody>(400, { ok: false, reason: 'bad_request', detail: 'discipline + id required' });
  }
  if (!locals.user) return json<ErrorBody>(403, { ok: false, reason: 'not_admin' });
  if (!locals.canEdit(discipline)) return json<ErrorBody>(403, { ok: false, reason: 'not_admin' });

  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json<ErrorBody>(503, { ok: false, reason: 'config_missing', detail: 'GITHUB_PAT 或 GITHUB_REPO 未配置' });
  }

  const path = `v2/data/${discipline}/kp/${id}.json`;

  // 从 GitHub 拉最新 — agent 刚 push 完，偶发延迟 retry 2 次（每次 backoff 500ms / 1s）
  let ghRes: Awaited<ReturnType<typeof getFile>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    ghRes = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
    if (ghRes.ok) break;
    if (ghRes.reason === 'not_found') break;  // 真不存在不 retry
    if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  if (!ghRes?.ok) {
    if (ghRes?.reason === 'not_found') {
      return json<ErrorBody>(404, { ok: false, reason: 'not_found_in_git', detail: `${path} 不在 GitHub` });
    }
    return json<ErrorBody>(502, { ok: false, reason: 'github_error', detail: ghRes?.detail ?? 'GitHub API failed' });
  }

  // parse + 校验
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(ghRes.data.content);
  } catch (e) {
    return json<ErrorBody>(422, { ok: false, reason: 'schema_invalid', detail: `invalid json: ${(e as Error).message}` });
  }
  const parsed = Kp.safeParse(parsedJson);
  if (!parsed.success) {
    return json<ErrorBody>(422, { ok: false, reason: 'schema_invalid', detail: parsed.error.issues });
  }
  const kp = parsed.data;
  // id / discipline 一致性 — 防 git 文件路径与 json 内字段不匹配
  if (kp.id !== id || kp.discipline !== discipline) {
    return json<ErrorBody>(400, {
      ok: false,
      reason: 'bad_request',
      detail: `path /${discipline}/${id} mismatches json {id:${kp.id}, discipline:${kp.discipline}}`,
    });
  }

  // 写 D1（带 retry，跟 v0.5.89 一致）
  try {
    await withRetry(() => upsertKpInD1(env.DB, kp));
  } catch (d1Err) {
    return json<ErrorBody>(500, { ok: false, reason: 'd1_write_failed', detail: String(d1Err) });
  }

  // 写 sync_log（让浏览器 polling 能感知到此次 sync）
  // status='partial_sync' 区分于 GH Actions 的全量 sync (status='success')
  const syncedAt = new Date().toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO sync_log (ran_at, commit_sha, status) VALUES (?, ?, ?)`,
    ).bind(syncedAt, ghRes.data.sha, 'partial_sync').run();
  } catch (logErr) {
    console.error('[sync-kp-from-git] sync_log insert failed (non-fatal):', logErr);
  }

  // public URL — 拼装当前站 origin
  const appUrl = (env as { APP_URL?: string }).APP_URL ?? 'https://management-study-v2.pages.dev';
  return json<SuccessBody>(200, {
    ok: true,
    kp_id: kp.id,
    discipline: kp.discipline,
    title_zh: kp.title.zh,
    commit_sha: ghRes.data.sha,
    d1_synced_at: new Date().toISOString(),
    public_url: `${appUrl}/${kp.discipline}/kp/${kp.id}`,
  });
};
