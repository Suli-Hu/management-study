/**
 * 编辑路由共享 helper (v0.4.4) — KP / school / scholar 三套 GET/PUT/DELETE 模式相同。
 *
 * 抽出来：admin gate、env 校验、SHA 乐观锁、commit message 模板、错误响应。
 */

import type { APIContext } from 'astro';
import { getFile, putFile, deleteFile } from './github';
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
  if (!ctx.locals.isAdmin) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

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
  if (!ctx.locals.isAdmin) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

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
}

export async function handleGet(opts: GetCtx): Promise<Response> {
  const { ctx, pathFor, resolveDiscipline, urlIdentifier } = opts;
  if (!ctx.locals.isAdmin) return jsonRes<EditError>(403, { ok: false, reason: 'not_admin' });

  const env = ctx.locals.runtime.env;
  if (!env.GITHUB_PAT || !env.GITHUB_REPO) {
    return jsonRes<EditError>(503, { ok: false, reason: 'config_missing' });
  }

  const ident = urlIdentifier();
  if (!ident) return jsonRes<EditError>(400, { ok: false, reason: 'bad_request' });

  const discipline = await resolveDiscipline(ident, env.DB);
  if (!discipline) return jsonRes<EditError>(404, { ok: false, reason: 'not_found' });

  const path = pathFor(ident, discipline);
  const res = await getFile({ pat: env.GITHUB_PAT, repo: env.GITHUB_REPO }, path);
  if (!res.ok) return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: res.detail });

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.data.content);
  } catch (e) {
    return jsonRes<EditError>(502, { ok: false, reason: 'github_error', detail: `invalid json: ${(e as Error).message}` });
  }
  return jsonRes(200, { ok: true, json: parsed, base_sha: res.data.sha });
}
