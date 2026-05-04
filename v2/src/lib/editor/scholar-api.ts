/**
 * Scholar editor v0.8 — API client
 *
 * POST /api/scholars?discipline=<key>          — 创建
 * PATCH /api/scholars/:key?discipline=<key>    — 更新
 *
 * 注：API-first 不接受 schoolsExplicit / kpsOrder。schoolsExplicit 由 backend 隐式
 * 视为 true（admin 显式选 schools[]）；kpsOrder 自动派生（D6=B）。
 */

export interface ScholarSaveOk {
  ok: true;
  scholar: { key: string; discipline: string };
}

export interface ScholarSaveErr {
  ok: false;
  status: number;
  category:
    | 'schema_invalid'
    | 'key_exists'
    | 'school_not_in_tenant'
    | 'forbidden'
    | 'not_found'
    | 'network'
    | 'unknown';
  reason: string;
  message: string;
  detail?: unknown;
  fieldPath?: Array<string | number>;
}

export type ScholarSaveResult = ScholarSaveOk | ScholarSaveErr;

export interface ScholarCreatePayload {
  discipline: string;
  key: string;
  name: { zh: string; ja?: string; en?: string };
  schools: string[];
  contribution: { zh: string; ja?: string };
  lifespan: string;
  institution: string;
  born: string;
  died: string;
  nationality: string;
  flag: string;
  origin: string;
  field: string;
  tags: string[];
  nobel: { year: string; detail: string } | null;
}

export interface ScholarPatchPayload {
  discipline: string;
  name?: { zh: string; ja?: string; en?: string };
  schools?: string[];
  contribution?: { zh: string; ja?: string };
  lifespan?: string;
  institution?: string;
  born?: string;
  died?: string;
  nationality?: string;
  flag?: string;
  origin?: string;
  field?: string;
  tags?: string[];
  nobel?: { year: string; detail: string } | null;
}

export async function createScholar(payload: ScholarCreatePayload): Promise<ScholarSaveResult> {
  const { discipline, ...body } = payload;
  return fetchAndClassify(`/api/scholars?discipline=${encodeURIComponent(discipline)}`, 'POST', body);
}

export async function patchScholar(
  key: string,
  payload: ScholarPatchPayload,
): Promise<ScholarSaveResult> {
  const { discipline, ...body } = payload;
  return fetchAndClassify(
    `/api/scholars/${encodeURIComponent(key)}?discipline=${encodeURIComponent(discipline)}`,
    'PATCH',
    body,
  );
}

async function fetchAndClassify(
  url: string,
  method: string,
  body: unknown,
): Promise<ScholarSaveResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      category: 'network',
      reason: 'network_error',
      message: '网络请求失败 — 请检查连接后重试',
      detail: String(e),
    };
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* 5xx may not return JSON */
  }

  if (res.ok) {
    return { ok: true, scholar: data.scholar as { key: string; discipline: string } };
  }

  const reason = String(data.reason ?? 'unknown');
  const message = String(data.message ?? messageFor(res.status, reason));

  return {
    ok: false,
    status: res.status,
    category: categorize(res.status, reason),
    reason,
    message,
    detail: data.detail,
    fieldPath: extractFirstPath(data.detail),
  };
}

function categorize(status: number, reason: string): ScholarSaveErr['category'] {
  if (status === 409 && reason === 'scholar_key_exists') return 'key_exists';
  if (status === 422 && reason === 'school_not_in_tenant') return 'school_not_in_tenant';
  if (status === 422) return 'schema_invalid';
  if (status === 404) return 'not_found';
  if (status === 403) return 'forbidden';
  if (status === 0) return 'network';
  if (status >= 500) return 'network';
  return 'unknown';
}

function messageFor(status: number, reason: string): string {
  if (status === 0) return '网络错误';
  if (status === 409 && reason === 'scholar_key_exists') return 'key 已存在';
  if (status === 422 && reason === 'school_not_in_tenant') return '所选学派不属于该学科';
  if (status === 422) return '字段校验失败';
  if (status === 403) return '权限不足';
  if (status === 404) return '未找到';
  return `请求失败 ${status}`;
}

function extractFirstPath(detail: unknown): Array<string | number> | undefined {
  if (!Array.isArray(detail)) return undefined;
  const first = detail[0];
  if (!first || typeof first !== 'object') return undefined;
  const path = (first as { path?: unknown }).path;
  if (Array.isArray(path)) return path as Array<string | number>;
  return undefined;
}
