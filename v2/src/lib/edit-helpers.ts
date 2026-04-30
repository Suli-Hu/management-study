/**
 * 编辑路由共享 helper (v0.4.4) — KP / school / scholar 三套 GET/PUT/DELETE 模式相同。
 *
 * 抽出来：admin gate、env 校验、SHA 乐观锁、commit message 模板、错误响应。
 */

import type { APIContext } from 'astro';
import { getFile, putFile, deleteFile } from './github';
import { withRetry } from './d1-kp-write';
import type { ZodTypeAny, infer as ZodInfer } from 'zod';

export type EditErrorReason =
  | 'not_admin'
  | 'config_missing'
  | 'bad_request'
  | 'schema_invalid'
  | 'key_mismatch'
  | 'sha_conflict'
  | 'github_error'
  | 'not_found';

export interface EditError {
  ok: false;
  reason: EditErrorReason;
  detail?: unknown;
  current_sha?: string;
}

export function jsonRes<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface PutCtx<S extends ZodTypeAny> {
  ctx: APIContext;
  schema: S;
  /** 给定 obj → 返回 path 在 repo 里的位置 */
  pathFor: (obj: ZodInfer<S>) => string;
  /** 用于 commit message 中的对象类型，如 'kp/k001' */
  objectLabel: (obj: ZodInfer<S>) => string;
  /** 校验 url 参数 vs body 中的标识符是否一致 */
  identifierMatch: (urlIdent: string, obj: ZodInfer<S>) => boolean;
  /** 从 url params 取标识符 */
  urlIdentifier: () => string | undefined;
  /** 强制服务端刷新的字段（如 updatedAt） */
  forceFields?: (obj: ZodInfer<S>) => Partial<ZodInfer<S>>;
}

export async function handlePut<S extends ZodTypeAny>(opts: PutCtx<S>): Promise<Response> {
  const { ctx, schema, pathFor, objectLabel, identifierMatch, urlIdentifier, forceFields } = opts;
  // v0.4.25 RBAC：admin gate 推迟到拿到 obj.discipline 之后（按学科粒度判定）
  if (!ctx.locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const env = ctx.locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  const ident = urlIdentifier();
  if (!ident) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'missing url identifier' });

  let body: { json?: unknown; base_sha?: string };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  if (!body.json || typeof body.base_sha !== 'string' || !body.base_sha) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'json + base_sha required' });
  }

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: parsed.error.issues });
  }
  let obj = parsed.data as ZodInfer<S>;
  // v0.4.25：现在能拿到 discipline，做 per-学科 admin gate
  const objDiscipline = (obj as { discipline?: string }).discipline;
  if (!objDiscipline || !ctx.locals.canEdit(objDiscipline)) {
    return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  }
  if (!identifierMatch(ident, obj)) {
    return jsonRes<EditError>(400, { ok: false, reason: 'key_mismatch', detail: `url ident ${ident} != obj` });
  }
  if (forceFields) {
    obj = { ...obj, ...forceFields(obj) };
  }

  const path = pathFor(obj);
  const adminEmail = ctx.locals.user?.email ?? 'unknown@admin';
  const message = `v2: edit ${objectLabel(obj)} by ${adminEmail}`;
  const content = JSON.stringify(obj, null, 2) + '\n';

  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, sha: body.base_sha, branch: 'main' },
  );
  if (!res.ok) {
    if (res.reason === 'conflict') {
      const cur = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
      return jsonRes<EditError>(409, {
        ok: false, reason: 'sha_conflict',
        current_sha: cur.ok ? cur.data.sha : undefined,
        detail: res.detail,
      });
    }
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: res.detail });
  }

  return jsonRes(200, {
    ok: true,
    commit_sha: res.data.commit_sha,
    new_blob_sha: res.data.new_blob_sha,
    deploy_eta_seconds: 90,
  });
}

interface PostCtx<S extends ZodTypeAny> {
  ctx: APIContext;
  schema: S;
  pathFor: (obj: ZodInfer<S>) => string;
  objectLabel: (obj: ZodInfer<S>) => string;
  /** 强制服务端字段（createdAt / updatedAt = now） */
  forceFields?: (obj: ZodInfer<S>) => Partial<ZodInfer<S>>;
  /**
   * v0.6.6: git commit 成功后双写 D1。失败只 console.error 不阻断响应
   * （git 已成功，backfill endpoint / webhook / 后续 edit PUT 都能自愈）。
   * 4 类资源各传对应的 upsertXxxInD1（kp/school/scholar/view）。
   */
  upsertD1?: (db: D1Database, obj: ZodInfer<S>) => Promise<void>;
}

/** 新建：POST 路由调它。不带 sha 写 = create；GitHub 返 422 时认为是 key 冲突。 */
export async function handlePost<S extends ZodTypeAny>(opts: PostCtx<S>): Promise<Response> {
  const { ctx, schema, pathFor, objectLabel, forceFields, upsertD1 } = opts;
  // v0.4.25 RBAC：admin gate 推迟到拿到 obj.discipline 之后
  if (!ctx.locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const env = ctx.locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  let body: { json?: unknown };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  if (!body.json) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'json required' });
  }

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return jsonRes<EditError>(422, { ok: false, reason: 'schema_invalid', detail: parsed.error.issues });
  }
  let obj = parsed.data as ZodInfer<S>;
  // v0.4.25 RBAC：拿到 obj.discipline 后做 per-学科 admin gate
  const objDiscipline = (obj as { discipline?: string }).discipline;
  if (!objDiscipline || !ctx.locals.canEdit(objDiscipline)) {
    return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });
  }
  if (forceFields) {
    obj = { ...obj, ...forceFields(obj) };
  }

  const path = pathFor(obj);

  // 先看文件是否已存在（key 冲突）
  const exists = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (exists.ok) {
    return jsonRes<EditError>(409, {
      ok: false, reason: 'sha_conflict',
      detail: `key 已存在：${path}（先去编辑现有）`,
      current_sha: exists.data.sha,
    });
  }

  const adminEmail = ctx.locals.user?.email ?? 'unknown@admin';
  const message = `v2: create ${objectLabel(obj)} by ${adminEmail}`;
  const content = JSON.stringify(obj, null, 2) + '\n';

  // PUT 不带 sha = create
  const res = await putFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { content, message, branch: 'main' },
  );
  if (!res.ok) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: res.detail });
  }

  // v0.6.6: D1 双写 — git 已 commit 成功后立即写 D1，让用户刷新就看到。
  // 失败只 console.error 不阻断（git 已成功，webhook / backfill endpoint 能自愈）。
  if (upsertD1 && env.DB) {
    try {
      await withRetry(() => upsertD1(env.DB, obj));
    } catch (d1Err) {
      console.error(`[handlePost ${objectLabel(obj)}] D1 dual-write failed (git committed; sync-discipline endpoint can backfill):`, d1Err);
    }
  }

  return jsonRes(201, {
    ok: true,
    commit_sha: res.data.commit_sha,
    new_blob_sha: res.data.new_blob_sha,
    deploy_eta_seconds: 90,
  });
}

interface DeleteCtx {
  ctx: APIContext;
  pathFor: (ident: string, discipline: string) => string;
  objectLabel: (ident: string) => string;
  /** 从 D1 查 discipline（学派/学者/KP 都需要因为 url 不带 discipline 时） */
  resolveDiscipline: (ident: string, db: any) => Promise<string | null>;
  urlIdentifier: () => string | undefined;
}

export async function handleDelete(opts: DeleteCtx): Promise<Response> {
  const { ctx, pathFor, objectLabel, resolveDiscipline, urlIdentifier } = opts;
  // v0.4.25 RBAC：admin gate 推迟到 resolveDiscipline 之后
  if (!ctx.locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const env = ctx.locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  const ident = urlIdentifier();
  if (!ident) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });

  let body: { base_sha?: string };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'body must be JSON' });
  }
  if (typeof body.base_sha !== 'string' || !body.base_sha) {
    return jsonRes<EditError>(400, { ok: false, reason: 'bad_request', detail: 'base_sha required' });
  }

  const discipline = await resolveDiscipline(ident, env.DB);
  if (!discipline) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });
  // v0.4.25 RBAC：拿到 discipline 后做 per-学科 admin gate
  if (!ctx.locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const path = pathFor(ident, discipline);
  const adminEmail = ctx.locals.user?.email ?? 'unknown@admin';
  const message = `v2: delete ${objectLabel(ident)} by ${adminEmail}`;

  const res = await deleteFile(
    { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO },
    path,
    { message, sha: body.base_sha, branch: 'main' },
  );
  if (!res.ok) {
    if (res.reason === 'conflict') {
      const cur = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
      return jsonRes<EditError>(409, {
        ok: false, reason: 'sha_conflict',
        current_sha: cur.ok ? cur.data.sha : undefined,
      });
    }
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: res.detail });
  }
  return jsonRes(200, { ok: true, commit_sha: res.data.commit_sha, deploy_eta_seconds: 90 });
}

interface GetCtx {
  ctx: APIContext;
  pathFor: (ident: string, discipline: string) => string;
  resolveDiscipline: (ident: string, db: any) => Promise<string | null>;
  urlIdentifier: () => string | undefined;
  /** 可选：返回前 merge 的额外字段（如 kp_count、themes）。键名不能与 ok/json/base_sha 冲突。 */
  enrich?: (ident: string, discipline: string, db: any) => Promise<Record<string, unknown>>;
}

export async function handleGet(opts: GetCtx): Promise<Response> {
  const { ctx, pathFor, resolveDiscipline, urlIdentifier, enrich } = opts;
  // v0.4.25 RBAC：admin gate 推迟到 resolveDiscipline 之后（GET 用于编辑器加载，需 canEdit）
  if (!ctx.locals.user) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const env = ctx.locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  const ident = urlIdentifier();
  if (!ident) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });

  const discipline = await resolveDiscipline(ident, env.DB);
  if (!discipline) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });
  if (!ctx.locals.canEdit(discipline)) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const path = pathFor(ident, discipline);
  const res = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!res.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: res.detail });

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.data.content);
  } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  const meta = enrich ? await enrich(ident, discipline, env.DB) : {};
  return jsonRes(200, { ok: true, json: parsed, base_sha: res.data.sha, ...meta });
}
