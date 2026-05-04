/**
 * School editor v0.8 — API client
 *
 * POST /api/schools?discipline=<key>          — 创建
 * PATCH /api/schools/:key?discipline=<key>    — 更新
 *
 * 错误分类与 KP editor api.ts 对齐（schema_invalid / forbidden / network ...）。
 */

export interface SchoolSaveOk {
  ok: true;
  school: { key: string; discipline: string };
}

export interface SchoolSaveErr {
  ok: false;
  status: number;
  category:
    | 'schema_invalid'
    | 'key_exists'
    | 'theme_not_found'
    | 'forbidden'
    | 'not_found'
    | 'network'
    | 'unknown';
  reason: string;
  message: string;
  detail?: unknown;
  fieldPath?: Array<string | number>;
}

export type SchoolSaveResult = SchoolSaveOk | SchoolSaveErr;

export interface SchoolCreatePayload {
  discipline: string;
  key: string;
  title: { zh: string; ja?: string; en?: string };
  era: string;
  summary: { zh: string; ja?: string };
  themeKey: string;
  tags: string[];
}

export interface SchoolPatchPayload {
  discipline: string;
  title?: { zh: string; ja?: string; en?: string };
  era?: string;
  summary?: { zh: string; ja?: string };
  themeKey?: string;
  tags?: string[];
}

export async function createSchool(payload: SchoolCreatePayload): Promise<SchoolSaveResult> {
  const { discipline, ...body } = payload;
  return fetchAndClassify(`/api/schools?discipline=${encodeURIComponent(discipline)}`, 'POST', body);
}

export async function patchSchool(
  key: string,
  payload: SchoolPatchPayload,
): Promise<SchoolSaveResult> {
  const { discipline, ...body } = payload;
  return fetchAndClassify(
    `/api/schools/${encodeURIComponent(key)}?discipline=${encodeURIComponent(discipline)}`,
    'PATCH',
    body,
  );
}

async function fetchAndClassify(url: string, method: string, body: unknown): Promise<SchoolSaveResult> {
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
    /* 5xx 可能返非 JSON */
  }

  if (res.ok) {
    return { ok: true, school: data.school as { key: string; discipline: string } };
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

function categorize(status: number, reason: string): SchoolSaveErr['category'] {
  if (status === 409 && reason === 'school_key_exists') return 'key_exists';
  if (status === 422 && reason === 'theme_not_in_tenant') return 'theme_not_found';
  if (status === 422) return 'schema_invalid';
  if (status === 404) return 'not_found';
  if (status === 403) return 'forbidden';
  if (status === 0) return 'network';
  if (status >= 500) return 'network';
  return 'unknown';
}

function messageFor(status: number, reason: string): string {
  if (status === 0) return '网络错误';
  if (status === 409 && reason === 'school_key_exists') return 'key 已存在';
  if (status === 422 && reason === 'theme_not_in_tenant') return '所选学派组不属于该学科';
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
