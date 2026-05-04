/**
 * Theme (ThemeGroup) editor v0.8 — API client
 *
 * POST /api/new/theme                              — body: { discipline, json: ThemeGroup }
 * PUT /api/edit/theme/:discipline/:key              — body: { title, desc?, tags? }
 *   schools 字段不接受（强制保留原值；详 PRD §5.3 备注）
 *
 * 注：theme 用 deprecated /api/new + /api/edit 路径（无 API-first equivalent）。
 */

export interface ThemeSaveOk {
  ok: true;
}

export interface ThemeSaveErr {
  ok: false;
  status: number;
  category:
    | 'schema_invalid'
    | 'key_exists'
    | 'forbidden'
    | 'not_found'
    | 'sha_conflict'
    | 'network'
    | 'unknown';
  reason: string;
  message: string;
  detail?: unknown;
  fieldPath?: Array<string | number>;
}

export type ThemeSaveResult = ThemeSaveOk | ThemeSaveErr;

export interface ThemeCreatePayload {
  discipline: string;
  json: {
    key: string;
    title: { zh: string; ja?: string; en?: string };
    desc?: { zh?: string; ja?: string };
    tags: string[];
  };
}

export interface ThemePatchPayload {
  discipline: string;
  key: string;
  title?: { zh: string; ja?: string; en?: string };
  desc?: { zh?: string; ja?: string };
  tags?: string[];
}

export async function createTheme(payload: ThemeCreatePayload): Promise<ThemeSaveResult> {
  return fetchAndClassify('/api/new/theme', 'POST', {
    discipline: payload.discipline,
    json: payload.json,
  });
}

export async function patchTheme(payload: ThemePatchPayload): Promise<ThemeSaveResult> {
  const { discipline, key, ...rest } = payload;
  return fetchAndClassify(
    `/api/edit/theme/${encodeURIComponent(discipline)}/${encodeURIComponent(key)}`,
    'PUT',
    rest,
  );
}

async function fetchAndClassify(
  url: string,
  method: string,
  body: unknown,
): Promise<ThemeSaveResult> {
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
    return { ok: true };
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

function categorize(status: number, reason: string): ThemeSaveErr['category'] {
  if (status === 409 && reason === 'key_exists') return 'key_exists';
  if (status === 409 && reason === 'sha_conflict') return 'sha_conflict';
  if (status === 422) return 'schema_invalid';
  if (status === 404) return 'not_found';
  if (status === 403) return 'forbidden';
  if (status === 0) return 'network';
  if (status >= 500) return 'network';
  return 'unknown';
}

function messageFor(status: number, reason: string): string {
  if (status === 0) return '网络错误';
  if (status === 409 && reason === 'key_exists') return 'key 已存在';
  if (status === 409 && reason === 'sha_conflict') return '远程已被更新，请刷新重试';
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
