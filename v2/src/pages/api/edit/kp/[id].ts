/**
 * PUT /api/edit/kp/:id  (v0.4.2)  —— 保存 KP 到 GitHub
 *   admin only。流程：
 *     1. 读 D1 当前 KP（用于乐观锁 base_sha 来源验证）
 *     2. 收到 { json, base_sha } —— json 全量字段，base_sha = GitHub blob SHA
 *     3. zod 校验 json
 *     4. 校验 id 与 url 一致 + discipline 与现有一致（不允许改 id/discipline）
 *     5. 设 updatedAt = now
 *     6. PUT contents API → 带 base_sha → 409 = 冲突 → 返 409 + 当前 sha
 *     7. 成功 → 返 { commit_sha, new_blob_sha, deploy_eta_seconds: 90 }
 */

import type { APIRoute } from 'astro';
import { Kp } from '~/schemas/kp';
import { getFile, putFile } from '~/lib/github';

interface SuccessBody {
  ok: true;
  commit_sha: string;
  new_blob_sha: string;
  deploy_eta_seconds: number;
}
interface ErrorBody {
  ok: false;
  reason:
    | 'not_admin'
    | 'config_missing'
    | 'bad_request'
    | 'schema_invalid'
    | 'id_mismatch'
    | 'sha_conflict'
    | 'github_error';
  detail?: unknown;
  current_sha?: string;
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.isAdmin) return json<ErrorBody>(403, { ok: false, reason: 'not_admin' });

  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json<ErrorBody>(503, { ok: false, reason: 'config_missing', detail: 'GITHUB_PAT 或 GITHUB_REPO 未配置' });
  }

  const id = params.id;
  if (!id) return json<ErrorBody>(400, { ok: false, reason: 'bad_request', detail: 'missing id' });

  let body: { json?: unknown; base_sha?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json<ErrorBody>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  if (!body.json || typeof body.base_sha !== 'string' || !body.base_sha) {
    return json<ErrorBody>(400, { ok: false, reason: 'bad_request', detail: 'fields json + base_sha required' });
  }

  // schema 校验
  const parsed = Kp.safeParse(body.json);
  if (!parsed.success) {
    return json<ErrorBody>(422, { ok: false, reason: 'schema_invalid', detail: parsed.error.issues });
  }
  const kp = parsed.data;

  // id 一致性 —— 不允许通过编辑器改 id（rename 走 worktree）
  if (kp.id !== id) {
    return json<ErrorBody>(400, { ok: false, reason: 'id_mismatch', detail: `body.json.id=${kp.id} ≠ url id=${id}` });
  }

  // updatedAt 强制刷为 now（防止前端伪造时间戳）
  kp.updatedAt = new Date().toISOString();

  const path = `v2/data/${kp.discipline}/kp/${kp.id}.json`;
  const adminEmail = locals.user?.email ?? 'unknown@admin';
  const message = `v2: edit kp/${kp.id} by ${adminEmail}`;
  const content = JSON.stringify(kp, null, 2) + '\n';

  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha: body.base_sha, branch: 'main' },
  );

  if (!res.ok) {
    if (res.reason === 'conflict') {
      // SHA 冲突 —— 把当前最新 sha 给前端，让用户决定 reload 还是覆盖
      const cur = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
      const current_sha = cur.ok ? cur.data.sha : undefined;
      return json<ErrorBody>(409, { ok: false, reason: 'sha_conflict', current_sha, detail: res.detail });
    }
    return json<ErrorBody>(502, { ok: false, reason: 'github_error', detail: res.detail });
  }

  return json<SuccessBody>(200, {
    ok: true,
    commit_sha: res.data.commit_sha,
    new_blob_sha: res.data.new_blob_sha,
    deploy_eta_seconds: 90,
  });
};

/** GET 用于编辑器页加载：返当前 JSON + base_sha */
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.isAdmin) return json<ErrorBody>(403, { ok: false, reason: 'not_admin' });

  const env = locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json<ErrorBody>(503, { ok: false, reason: 'config_missing' });
  }

  const id = params.id;
  if (!id) return json<ErrorBody>(400, { ok: false, reason: 'bad_request' });

  // 必须先知道 discipline 才能定位文件，先查 D1
  const db = env.DB;
  const row = await db
    .prepare('SELECT discipline FROM kp WHERE id = ?')
    .bind(id)
    .first<{ discipline: string }>();
  if (!row) return json<ErrorBody>(404, { ok: false, reason: 'bad_request', detail: 'kp not in D1' });

  const path = `v2/data/${row.discipline}/kp/${id}.json`;
  const res = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!res.ok) {
    return json<ErrorBody>(502, { ok: false, reason: 'github_error', detail: res.detail });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.data.content);
  } catch (e) {
    return json<ErrorBody>(502, { ok: false, reason: 'github_error', detail: `invalid json in repo: ${(e as Error).message}` });
  }

  return json(200, { ok: true, json: parsed, base_sha: res.data.sha });
};
