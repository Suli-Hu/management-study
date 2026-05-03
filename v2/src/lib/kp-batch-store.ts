/**
 * Batch KP edit store — v0.8.0 Stage 3 hard cut.
 *
 * 实现 PATCH /api/kps/batch 端点的核心逻辑：
 *   - 批量预查 tenant 的 schools/scholars 全集（避免 N+1）
 *   - 每条逐项处理：tenant 校验 → version 校验（乐观锁）→ shallow merge → 写 D1
 *   - dryRun 模式：merge + diff，不写
 *   - 逐条独立结果，不强行整批事务
 *
 * shallow merge 语义（v0.8.0，详 migration-v0.8.md §5.2）：
 *   - title    — 按语种 shallow merge（zh/ja/en 各自独立替换）
 *   - body     — 按语种 shallow merge（zh/ja 各自整体替换 KpBody；单语种内部不再 deep merge）
 *   - evaluations — 按语种 shallow merge（zh/ja 各自整体替换 KpEvaluationsLang Record）
 *   - 数组（schools/scholars/tags） — 整体替换；空数组 = 真清空
 */

import { KpBatchPatchInput } from '~/schemas/kp-batch-api';
import type { KpBody, KpEvaluationsLang } from '~/schemas/kp-body-structured';
import {
  getKpRecord,
  getKpStructured,
  type KpApiRecord,
} from './kp-api-store';
import {
  structuredToLegacyDsl,
  evaluationsLangToLegacyEvalContent,
  hasEvaluationsContent,
} from './kp-body-helpers';
import {
  detectLegacyContract,
  classifyZodFailure,
  MIGRATION_GUIDE_URL,
} from './kp-legacy-detector';

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
  // v0.8.0 新增：明确拒绝旧字段（虽然 zod strict 也会拒，但配合 forbidden_field reason 更明确）
  'format',
  'evalContent',
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
 * Merged 内部状态：保留 KpApiRecord 的旧 shape（response 兼容）+ 同步保留结构化
 * body/evaluations，以便 dual-write 旧 + 新列。
 */
export interface MergedKpState {
  /** 用于 GET response shape / FTS 索引等旧消费方 */
  legacy: KpApiRecord;
  /** 用于 D1 新列写入 + Stage 4+ 编辑器 read */
  structuredBody: { zh: KpBody; ja?: KpBody };
  structuredEvaluations: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
}

/**
 * partial-by-language merge — title/body/evaluations 按 zh/ja 各自整体替换；
 * 数组字段整体替换；标量整体替换。
 *
 * @param current      KP 旧 shape (DSL string body + format + evalContent)
 * @param currentS     KP 结构化 shape (KpBody + KpEvaluationsLang)
 * @param patch        新 contract 的 partial patch
 */
export function mergeBatchPatch(
  current: KpApiRecord,
  currentS: { body: { zh: KpBody; ja?: KpBody }; evaluations: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang } },
  patch: KpBatchPatchInput,
): MergedKpState {
  // title — 按语种 shallow merge
  const mergedTitle: KpApiRecord['title'] = {
    zh: patch.title?.zh ?? current.title.zh,
    ...(patch.title?.ja !== undefined
      ? { ja: patch.title.ja }
      : current.title.ja !== undefined
        ? { ja: current.title.ja }
        : {}),
    ...(patch.title?.en !== undefined
      ? { en: patch.title.en }
      : current.title.en !== undefined
        ? { en: current.title.en }
        : {}),
  };

  // body — 按语种整体替换 KpBody
  const mergedBody: { zh: KpBody; ja?: KpBody } = {
    zh: patch.body?.zh ?? currentS.body.zh,
    ...(patch.body?.ja !== undefined
      ? { ja: patch.body.ja }
      : currentS.body.ja !== undefined
        ? { ja: currentS.body.ja }
        : {}),
  };

  // evaluations — 按语种整体替换 KpEvaluationsLang
  const mergedEvaluations: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang } = {
    ...(patch.evaluations?.zh !== undefined
      ? { zh: patch.evaluations.zh }
      : currentS.evaluations.zh
        ? { zh: currentS.evaluations.zh }
        : {}),
    ...(patch.evaluations?.ja !== undefined
      ? { ja: patch.evaluations.ja }
      : currentS.evaluations.ja
        ? { ja: currentS.evaluations.ja }
        : {}),
  };

  // 派生旧 shape KpApiRecord（GET response / FTS 用）
  const evalContentLegacy: KpApiRecord['evalContent'] = (() => {
    const out: { zh?: Record<string, string>; ja?: Record<string, string> } = {};
    if (mergedEvaluations.zh && hasEvaluationsContent(mergedEvaluations.zh)) {
      out.zh = evaluationsLangToLegacyEvalContent(mergedEvaluations.zh);
    }
    if (mergedEvaluations.ja && hasEvaluationsContent(mergedEvaluations.ja)) {
      out.ja = evaluationsLangToLegacyEvalContent(mergedEvaluations.ja);
    }
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const mergedLegacy: KpApiRecord = {
    ...current,
    title: mergedTitle,
    body: {
      zh: structuredToLegacyDsl(mergedBody.zh),
      ...(mergedBody.ja ? { ja: structuredToLegacyDsl(mergedBody.ja) } : {}),
    },
    format: mergedBody.zh.format,
    schools: patch.schools ?? current.schools,
    scholars: patch.scholars ?? current.scholars,
    tags: patch.tags ?? current.tags,
    year: patch.year ?? current.year,
    evalContent: evalContentLegacy,
  };

  return {
    legacy: mergedLegacy,
    structuredBody: mergedBody,
    structuredEvaluations: mergedEvaluations,
  };
}

/** 计算 diff，按 PRD §3.4.2 规则：嵌套对象点路径展开；只列被改的字段。 */
export function computeDiff(
  current: KpApiRecord,
  merged: KpApiRecord,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};

  // title 第 1 层（zh/ja/en）拆 sub-key
  for (const lang of ['zh', 'ja', 'en'] as const) {
    const before = current.title?.[lang];
    const after = merged.title?.[lang];
    if (before !== after) diff[`title.${lang}`] = { before, after };
  }
  // body 第 1 层（zh/ja）拆 sub-key — 注意 v0.8.0 起 body.zh 是 DSL 反推 string，
  // 实际 caller 看到的是 legacy shape；diff 仍按字符串比较
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

/** 写一条 KP 到 D1（含 joins + fts + version 快照）。 */
async function writeKpFromMerged(
  db: D1Database,
  kpId: string,
  tenant: { tenantId: string; discipline: string },
  state: MergedKpState,
  userId: string,
): Promise<{ ok: true; new_version: number } | { ok: false; reason: string; detail?: unknown }> {
  const now = new Date().toISOString();
  const merged = state.legacy;

  // 派生新列
  const evalsZh = state.structuredEvaluations.zh;
  const evalsJa = state.structuredEvaluations.ja;
  const hasZh = hasEvaluationsContent(evalsZh);
  const hasJa = hasEvaluationsContent(evalsJa);

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE kp SET
        year = ?, title_zh = ?, title_en = ?, title_ja = ?,
        body_zh = ?, body_ja = ?, tags_json = ?,
        eval_content_zh_json = ?, eval_content_ja_json = ?,
        format = ?, updated_by = ?, updated_at = ?,
        body_zh_json = ?, body_ja_json = ?, evaluations_zh_json = ?, evaluations_ja_json = ?, body_format = ?
       WHERE id = ? AND COALESCE(tenant_id, discipline) = ? AND discipline = ?`,
    ).bind(
      merged.year ?? '',
      merged.title.zh,
      merged.title.en ?? null,
      merged.title.ja ?? null,
      merged.body.zh,
      merged.body.ja ?? null,
      JSON.stringify(merged.tags ?? []),
      merged.evalContent?.zh ? JSON.stringify(merged.evalContent.zh) : '{}',
      merged.evalContent?.ja ? JSON.stringify(merged.evalContent.ja) : '{}',
      merged.format,
      userId,
      now,
      JSON.stringify(state.structuredBody.zh),
      state.structuredBody.ja ? JSON.stringify(state.structuredBody.ja) : null,
      hasZh && evalsZh ? JSON.stringify(evalsZh) : null,
      hasJa && evalsJa ? JSON.stringify(evalsJa) : null,
      state.structuredBody.zh.format,
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

/**
 * Outer-validated raw update — id/ifMatchVersion 已规范化，patch 仍是 raw object
 * 留给 store 内部做 v0.8.0 legacy detector + per-item strict zod parse。
 */
export interface RawBatchUpdate {
  id: string;
  ifMatchVersion?: number;
  patch: unknown;
}

/** 主入口 — 处理一批 updates 返聚合结果。 */
export async function patchKpsBatch(
  db: D1Database,
  rawUpdates: RawBatchUpdate[],
  options: BatchOptions,
): Promise<BatchOutcome> {
  const tenantKeys = await prefetchTenantKeys(db, options.tenant.discipline);
  const results: BatchItemResult[] = [];

  for (const rawUpdate of rawUpdates) {
    const result = await processOne(db, rawUpdate, options, tenantKeys);
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
  rawUpdate: RawBatchUpdate,
  options: BatchOptions,
  tenantKeys: TenantKeys,
): Promise<BatchItemResult> {
  const { id, ifMatchVersion, patch: rawPatch } = rawUpdate;

  // 1. v0.8.0 Stage 3：先识别 legacy contract（更具体的 reason），再做 forbidden_field
  //    + zod parse —— 否则 'format' / 'evalContent' 会被 forbidden_field 集合拦截，
  //    丢失了更明确的 migration_guide 提示。
  const legacy = detectLegacyContract(rawPatch);
  if (legacy) {
    const current = await getKpRecord(db, id);
    const currentVersion = current && current.discipline === options.tenant.discipline
      ? await getCurrentVersion(db, id)
      : undefined;
    return {
      id,
      ok: false,
      reason: legacy.reason,
      current_version: currentVersion,
      detail: {
        message: legacy.message,
        migration_guide: MIGRATION_GUIDE_URL,
      },
    };
  }

  // 2. forbidden_field（id / discipline / version / created_by 等基础设施字段）
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

  // 3. zod parse strict — 失败分类成 body_format_invalid / body_structure_invalid / invalid_patch
  const parsedPatch = KpBatchPatchInput.safeParse(rawPatch);
  if (!parsedPatch.success) {
    const cls = classifyZodFailure(parsedPatch.error);
    const current = await getKpRecord(db, id);
    const currentVersion = current && current.discipline === options.tenant.discipline
      ? await getCurrentVersion(db, id)
      : undefined;
    return {
      id,
      ok: false,
      reason: cls.reason,
      current_version: currentVersion,
      detail: {
        issues: parsedPatch.error.issues,
        migration_guide: MIGRATION_GUIDE_URL,
      },
    };
  }
  const patch = parsedPatch.data;

  // 4. fetch current
  const current = await getKpRecord(db, id);
  if (!current) return { id, ok: false, reason: 'kp_not_found' };

  // 5. tenant 校验（KP 存在但跨 tenant — 不返 current_version 防泄露）
  if (
    current.tenant_id !== options.tenant.tenantId ||
    current.discipline !== options.tenant.discipline
  ) {
    return { id, ok: false, reason: 'kp_not_in_tenant' };
  }

  // 6. version 校验（乐观锁）
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

  // 7. fetch current structured（merge body/evaluations 时用）
  const currentStructured = await getKpStructured(db, id);
  if (!currentStructured) {
    return {
      id,
      ok: false,
      reason: 'kp_structured_missing',
      current_version: currentVersion,
    };
  }

  // 8. merge
  const merged = mergeBatchPatch(current, currentStructured, patch);

  // 9. 校验 merged.schools/scholars 是否都属于 tenant（用预查的全集，O(1) 查）
  const invalidSchools = merged.legacy.schools.filter((k) => !tenantKeys.schools.has(k));
  if (invalidSchools.length > 0) {
    return {
      id,
      ok: false,
      reason: 'school_not_in_tenant',
      current_version: currentVersion,
      detail: { invalid_keys: invalidSchools },
    };
  }
  const invalidScholars = merged.legacy.scholars.filter((k) => !tenantKeys.scholars.has(k));
  if (invalidScholars.length > 0) {
    return {
      id,
      ok: false,
      reason: 'scholar_not_in_tenant',
      current_version: currentVersion,
      detail: { invalid_keys: invalidScholars },
    };
  }

  // 10. dryRun → 计算 diff 返
  if (options.dryRun) {
    return {
      id,
      ok: true,
      current_version: currentVersion,
      diff: computeDiff(current, merged.legacy),
    };
  }

  // 11. 真写
  const writeResult = await writeKpFromMerged(db, id, options.tenant, merged, options.userId);
  if (!writeResult.ok) {
    return { id, ok: false, reason: writeResult.reason, detail: writeResult.detail };
  }

  return {
    id,
    ok: true,
    version: writeResult.new_version,
    changed_fields: Object.keys(computeDiff(current, merged.legacy)),
  };
}
