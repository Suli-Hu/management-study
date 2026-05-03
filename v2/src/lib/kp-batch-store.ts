/**
 * Batch KP edit store (v0.7.35).
 *
 * 实现 PATCH /api/kps/batch 端点的核心逻辑：
 *   - 批量预查 tenant 的 schools/scholars 全集（避免 N+1）
 *   - 每条逐项处理：tenant 校验 → version 校验（乐观锁）→ shallow merge → 写 D1
 *   - dryRun 模式：merge + diff，不写
 *   - 逐条独立结果，不强行整批事务
 *
 * shallow merge 语义：title/body/evalContent 第 1 层 merge；
 *   evalContent.zh / evalContent.ja Record 整体替换。详见 PRD §3.2.1 + §5.5。
 */

import type { KpBatchPatchInput, KpBatchUpdateItem } from '~/schemas/kp-batch-api';
import { getKpRecord, type KpApiRecord } from './kp-api-store';

// 禁止字段（PRD §3.2.5）— 出现在 patch 里立即返 forbidden_field
// 注意：因为 zod schema strict() 已经会拒绝未知 key，这里再显式 check 是双保险，
// 也覆盖将来 schema 加列后可能的漏防。
const FORBIDDEN_FIELDS = new Set([
  'id',
  'discipline',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
  'version',
  'tenant_id',
  'created_by',
  'updated_by',
]);

export interface BatchItemSuccess {
  id: string;
  ok: true;
  version?: number;          // 写入后的新 version（非 dryRun）
  current_version?: number;  // 当前 version（dryRun）
  changed_fields?: string[]; // 非 dryRun 用，点路径
  diff?: Record<string, { before: unknown; after: unknown }>; // dryRun 用
}

export interface BatchItemFailure {
  id: string;
  ok: false;
  reason: string;
  current_version?: number;  // §3.6 表：部分错误返
  expected_version?: number; // version_conflict 时返
  detail?: unknown;
}

export type BatchItemResult = BatchItemSuccess | BatchItemFailure;

export interface BatchOutcome {
  results: BatchItemResult[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

interface TenantKeys {
  schools: Set<string>;
  scholars: Set<string>;
}

/** 一次拿全 tenant 的合法 schools/scholars key，避免 50 条触发 100 次 DB query。 */
async function prefetchTenantKeys(db: D1Database, discipline: string): Promise<TenantKeys> {
  const [schoolsRes, scholarsRes] = await Promise.all([
    db
      .prepare('SELECT key FROM school WHERE discipline = ?')
      .bind(discipline)
      .all<{ key: string }>(),
    db
      .prepare('SELECT key FROM scholar WHERE discipline = ?')
      .bind(discipline)
      .all<{ key: string }>(),
  ]);
  return {
    schools: new Set((schoolsRes.results ?? []).map((r) => r.key)),
    scholars: new Set((scholarsRes.results ?? []).map((r) => r.key)),
  };
}

async function getCurrentVersion(db: D1Database, kpId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(MAX(version), 0) as v FROM knowledge_point_versions WHERE kp_id = ?')
    .bind(kpId)
    .first<{ v: number }>();
  return row?.v ?? 0;
}

/**
 * Shallow merge：title/body/evalContent 第 1 层 merge；其它字段整体替换。
 * 不传的 key 在 patch 里 = undefined，等价于"保持原值"。
 */
export function mergeBatchPatch(current: KpApiRecord, patch: KpBatchPatchInput): KpApiRecord {
  return {
    ...current,
    ...(patch.year !== undefined ? { year: patch.year } : {}),
    ...(patch.format !== undefined ? { format: patch.format } : {}),
    ...(patch.schools !== undefined ? { schools: patch.schools } : {}),
    ...(patch.scholars !== undefined ? { scholars: patch.scholars } : {}),
    ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
    title: patch.title ? { ...current.title, ...patch.title } : current.title,
    body: patch.body ? { ...current.body, ...patch.body } : current.body,
    evalContent: patch.evalContent
      ? { ...(current.evalContent ?? {}), ...patch.evalContent }
      : current.evalContent,
  };
}

/** 计算 diff，按 PRD §3.4.2 规则：嵌套对象点路径展开；只列被改的字段。 */
export function computeDiff(
  current: KpApiRecord,
  merged: KpApiRecord,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};

  // title / body 第 1 层（zh/ja/en）拆 sub-key
  for (const lang of ['zh', 'ja', 'en'] as const) {
    const before = current.title?.[lang];
    const after = merged.title?.[lang];
    if (before !== after) diff[`title.${lang}`] = { before, after };
  }
  for (const lang of ['zh', 'ja'] as const) {
    const before = current.body?.[lang];
    const after = merged.body?.[lang];
    if (before !== after) diff[`body.${lang}`] = { before, after };
  }

  // evalContent.zh / evalContent.ja 整体比对（Record 整体替换语义）
  for (const lang of ['zh', 'ja'] as const) {
    const before = current.evalContent?.[lang];
    const after = merged.evalContent?.[lang];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diff[`evalContent.${lang}`] = { before, after };
    }
  }

  // 标量
  if (current.year !== merged.year) diff['year'] = { before: current.year, after: merged.year };
  if (current.format !== merged.format) diff['format'] = { before: current.format, after: merged.format };

  // 数组：整体 before/after
  if (!arraysEqual(current.schools, merged.schools)) {
    diff['schools'] = { before: current.schools, after: merged.schools };
  }
  if (!arraysEqual(current.scholars, merged.scholars)) {
    diff['scholars'] = { before: current.scholars, after: merged.scholars };
  }
  if (!arraysEqual(current.tags, merged.tags)) {
    diff['tags'] = { before: current.tags, after: merged.tags };
  }

  return diff;
}

function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** 写一条 KP 到 D1（含 joins + fts + version 快照）。复用 patchKpRecord 的 SQL 模式但接受 already-merged state。 */
async function writeKpFromMerged(
  db: D1Database,
  kpId: string,
  tenant: { tenantId: string; discipline: string },
  merged: KpApiRecord,
  userId: string,
): Promise<{ ok: true; new_version: number } | { ok: false; reason: string; detail?: unknown }> {
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE kp SET
        year = ?, title_zh = ?, title_en = ?, title_ja = ?,
        body_zh = ?, body_ja = ?, tags_json = ?,
        eval_content_zh_json = ?, eval_content_ja_json = ?,
        format = ?, updated_by = ?, updated_at = ?
       WHERE id = ? AND COALESCE(tenant_id, discipline) = ? AND discipline = ?`,
    ).bind(
      merged.year ?? '',
      merged.title.zh,
      merged.title.en ?? null,
      merged.title.ja ?? null,
      merged.body.zh,
      merged.body.ja ?? null,
      JSON.stringify(merged.tags ?? []),
      JSON.stringify(merged.evalContent?.zh ?? {}),
      JSON.stringify(merged.evalContent?.ja ?? {}),
      merged.format,
      userId,
      now,
      kpId,
      tenant.tenantId,
      tenant.discipline,
    ),
    db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_scholar WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(kpId),
    db.prepare(
      'INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(kpId, merged.title.zh, merged.title.en ?? '', merged.title.ja ?? '', merged.body.zh, merged.body.ja ?? ''),
  ];

  merged.schools.forEach((schoolKey, i) => {
    stmts.push(
      db
        .prepare('INSERT INTO kp_school (kp_id, school_key, position) VALUES (?, ?, ?)')
        .bind(kpId, schoolKey, 1000 + i),
    );
  });
  merged.scholars.forEach((scholarKey, i) => {
    stmts.push(
      db
        .prepare(
          'INSERT INTO kp_scholar (kp_id, scholar_discipline, scholar_key, position) VALUES (?, ?, ?, ?)',
        )
        .bind(kpId, tenant.discipline, scholarKey, 1000 + i),
    );
  });

  await db.batch(stmts);

  // version 快照在 batch 后单写（与 patchKpRecord 一致）
  const newVersion = (await getCurrentVersion(db, kpId)) + 1;
  await db
    .prepare(
      'INSERT INTO knowledge_point_versions (kp_id, tenant_id, version, snapshot_json, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      kpId,
      tenant.tenantId,
      newVersion,
      JSON.stringify({ ...merged, updated_by: userId, updated_at: now }),
      userId,
      now,
    )
    .run();

  return { ok: true, new_version: newVersion };
}

/** 检查 patch 里是否含禁止字段（双保险，schema strict 已拦但留着）。 */
function findForbiddenFields(rawPatch: unknown): string[] {
  if (!rawPatch || typeof rawPatch !== 'object') return [];
  return Object.keys(rawPatch as Record<string, unknown>).filter((k) => FORBIDDEN_FIELDS.has(k));
}

export interface BatchOptions {
  dryRun: boolean;
  tenant: { tenantId: string; discipline: string };
  userId: string;
}

/** 主入口 — 处理一批 updates 返聚合结果。 */
export async function patchKpsBatch(
  db: D1Database,
  updates: KpBatchUpdateItem[],
  options: BatchOptions,
  /** raw updates body：用来检查 forbidden_field（zod parse 后已被 strict 移除，需对原始数据查） */
  rawUpdates?: unknown[],
): Promise<BatchOutcome> {
  const tenantKeys = await prefetchTenantKeys(db, options.tenant.discipline);
  const results: BatchItemResult[] = [];

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const result = await processOne(db, update, options, tenantKeys, rawUpdates?.[i]);
    results.push(result);
  }

  const succeeded = results.filter((r) => r.ok).length;
  return {
    results,
    summary: {
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
    },
  };
}

async function processOne(
  db: D1Database,
  update: KpBatchUpdateItem,
  options: BatchOptions,
  tenantKeys: TenantKeys,
  rawUpdate: unknown,
): Promise<BatchItemResult> {
  const { id, ifMatchVersion, patch } = update;

  // 1. forbidden_field 检查（针对 raw input — 对 strict-parsed patch 已没意义，但留着兜底）
  if (rawUpdate && typeof rawUpdate === 'object') {
    const rawPatch = (rawUpdate as { patch?: unknown }).patch;
    const forbidden = findForbiddenFields(rawPatch);
    if (forbidden.length > 0) {
      const current = await getKpRecord(db, id);
      const currentVersion = current ? await getCurrentVersion(db, id) : undefined;
      return {
        id,
        ok: false,
        reason: 'forbidden_field',
        current_version: current && current.discipline === options.tenant.discipline ? currentVersion : undefined,
        detail: { fields: forbidden },
      };
    }
  }

  // 2. fetch current
  const current = await getKpRecord(db, id);
  if (!current) return { id, ok: false, reason: 'kp_not_found' };

  // 3. tenant 校验（KP 存在但跨 tenant — 不返 current_version 防泄露）
  if (
    current.tenant_id !== options.tenant.tenantId ||
    current.discipline !== options.tenant.discipline
  ) {
    return { id, ok: false, reason: 'kp_not_in_tenant' };
  }

  // 4. version 校验（乐观锁）
  const currentVersion = await getCurrentVersion(db, id);
  if (!options.dryRun) {
    if (ifMatchVersion === undefined) {
      return {
        id,
        ok: false,
        reason: 'ifMatchVersion_required',
        current_version: currentVersion,
      };
    }
    if (currentVersion !== ifMatchVersion) {
      return {
        id,
        ok: false,
        reason: 'version_conflict',
        current_version: currentVersion,
        expected_version: ifMatchVersion,
      };
    }
  }

  // 5. merge
  const merged = mergeBatchPatch(current, patch);

  // 6. 校验 merged.schools/scholars 是否都属于 tenant（用预查的全集，O(1) 查）
  const invalidSchools = merged.schools.filter((k) => !tenantKeys.schools.has(k));
  if (invalidSchools.length > 0) {
    return {
      id,
      ok: false,
      reason: 'school_not_in_tenant',
      current_version: currentVersion,
      detail: { invalid_keys: invalidSchools },
    };
  }
  const invalidScholars = merged.scholars.filter((k) => !tenantKeys.scholars.has(k));
  if (invalidScholars.length > 0) {
    return {
      id,
      ok: false,
      reason: 'scholar_not_in_tenant',
      current_version: currentVersion,
      detail: { invalid_keys: invalidScholars },
    };
  }

  // 7. dryRun → 计算 diff 返
  if (options.dryRun) {
    return {
      id,
      ok: true,
      current_version: currentVersion,
      diff: computeDiff(current, merged),
    };
  }

  // 8. 真写
  const writeResult = await writeKpFromMerged(db, id, options.tenant, merged, options.userId);
  if (!writeResult.ok) {
    return { id, ok: false, reason: writeResult.reason, detail: writeResult.detail };
  }

  return {
    id,
    ok: true,
    version: writeResult.new_version,
    changed_fields: Object.keys(computeDiff(current, merged)),
  };
}
