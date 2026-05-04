/**
 * KP 编辑器 v0.8 — API client
 *
 * 5 endpoint 调用 + 错误分类（按 PRD §4.1 + migration-v0.8.md §7）。
 * 不重试、不 deduplicate — 这层是纯 fetch + 反序列化。
 */

import type { KpBody, KpEvaluationsLang } from '~/schemas/kp-body-structured';
import type { Format } from './state';

// ============================================================
// Types
// ============================================================

/**
 * 创建 / 更新 response 的最小 shape — Stage 4 仅用 id（用于 POST 后跳到 edit 页）。
 * GET 返 legacy shape（migration-v0.8.md §1 — Stage 5 才迁），所以编辑器不调 GET，
 * 改用 server-side render hydration（edit.astro 直接从 D1 读 structured 列）。
 */
export interface KpSaveResponseMinimal {
  id: string;
  discipline: string;
}

export interface SaveResultOk {
  ok: true;
  kp: KpSaveResponseMinimal;
}

export interface SaveResultErr {
  ok: false;
  status: number;
  /** Categorized for UI display. */
  category:
    | 'editor_bug' // 编辑器自己造的 legacy_* shape — 不应发生
    | 'schema_invalid' // schema_invalid（非 body）— Stage 4 F4
    | 'body_invalid' // body_format_invalid / body_structure_invalid
    | 'version_conflict' // 409
    | 'forbidden' // 403 tenant_mismatch / forbidden_field
    | 'not_found'
    | 'network'
    | 'unknown';
  reason: string;
  message: string;
  detail?: unknown;
  /** field path (e.g. ['body','zh','items',0,'name']) — 给 inline highlight 用 */
  fieldPath?: Array<string | number>;
}

export type SaveResult = SaveResultOk | SaveResultErr;

export interface CreatePayload {
  discipline: string;
  title: { zh: string; ja?: string; en?: string };
  body: { zh: KpBody; ja?: KpBody };
  evaluations?: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
  schools: string[];
  scholars: string[];
  tags: string[];
  year: string;
}

export interface PatchPayload {
  // partial-by-language；仅含改动字段
  title?: { zh?: string; ja?: string; en?: string };
  body?: { zh?: KpBody; ja?: KpBody };
  evaluations?: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
  schools?: string[];
  scholars?: string[];
  tags?: string[];
  year?: string;
}

// ============================================================
// Fetchers
// ============================================================

export async function fetchEmptyBody(format: Format): Promise<KpBody> {
  const res = await fetch(`/api/kps/empty-body?format=${encodeURIComponent(format)}`, {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`fetchEmptyBody ${format} failed: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; body: KpBody };
  return data.body;
}

export async function createKp(payload: CreatePayload): Promise<SaveResult> {
  const { discipline, ...body } = payload;
  return fetchAndClassify(`/api/kps?discipline=${encodeURIComponent(discipline)}`, 'POST', body);
}

export async function patchKp(id: string, payload: PatchPayload): Promise<SaveResult> {
  return fetchAndClassify(`/api/kps/${encodeURIComponent(id)}`, 'PATCH', payload);
}

// ============================================================
// Internal: fetch + classify
// ============================================================

async function fetchAndClassify(url: string, method: string, body: unknown): Promise<SaveResult> {
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
    // 5xx 可能返非 JSON
  }

  if (res.ok) {
    return { ok: true, kp: data.kp as KpSaveResponseMinimal };
  }

  const reason = String(data.reason ?? 'unknown');
  const message = String(data.message ?? `请求失败 ${res.status}`);
  const detail = data.detail;

  return {
    ok: false,
    status: res.status,
    category: categorize(res.status, reason),
    reason,
    message,
    detail,
    fieldPath: extractFirstPath(detail),
  };
}

function categorize(status: number, reason: string): SaveResultErr['category'] {
  if (status === 409 && reason === 'version_conflict') return 'version_conflict';
  if (status === 404) return 'not_found';
  if (status === 403) return 'forbidden';
  if (status === 422) {
    if (reason.startsWith('legacy_')) return 'editor_bug';
    if (reason === 'schema_invalid') return 'schema_invalid';
    if (reason === 'body_format_invalid' || reason === 'body_structure_invalid') return 'body_invalid';
    return 'schema_invalid';
  }
  if (status === 0) return 'network';
  if (status >= 500) return 'network';
  return 'unknown';
}

/** 从 zod issues 抽出第一个 issue 的 path，用于 UI 字段高亮。 */
function extractFirstPath(detail: unknown): Array<string | number> | undefined {
  if (!Array.isArray(detail)) return undefined;
  const first = detail[0];
  if (!first || typeof first !== 'object') return undefined;
  const path = (first as { path?: unknown }).path;
  if (Array.isArray(path)) return path as Array<string | number>;
  return undefined;
}
