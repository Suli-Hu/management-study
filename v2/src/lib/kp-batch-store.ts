/**
 * Batch KP edit store — v0.8.10 Stage 5: 拆双轨后只读写新列。
 *
 * 实现 PATCH /api/kps/batch 端点的核心逻辑：
 *   - 批量预查 tenant 的 schools/scholars 全集（避免 N+1）
 *   - 每条逐项处理：tenant 校验 → version 校验（乐观锁）→ shallow merge → 写 D1
 *   - dryRun 模式：merge + diff，不写
 *   - 逐条独立结果，不强行整批事务
 *
 * shallow merge 语义（v0.8.0 起，详 migration-v0.8.md §5.2）：
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
import { hasEvaluationsContent, structuredToSearchText } from './kp-body-helpers';
import {
  detectLegacyContract,
  classifyZodFailure,
  MIGRATION_GUIDE_URL,
} from './kp-legacy-detector';
import { deepStripStrong } from './sanitize-strong';
// v0.11.66 ja 校验 import 已移除（server-side 校验 revert）

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
  // v0.8.0 起明确拒绝旧字段（虽然 zod strict 也会拒，但配合 forbidden_field reason 更明确）
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
  tags: Set<string>;             /* v0.8.37 Phase 3: tag library keys */
}

/** 一次拿全 tenant 的合法 schools/scholars/tags key，避免 50 条触发 N×3 次 DB query。 */
async function prefetchTenantKeys(db: D1Database, discipline: string): Promise<TenantKeys> {
  const [schoolsRes, scholarsRes, discRow] = await Promise.all([
    db
      .prepare('SELECT key FROM school WHERE discipline = ?')
      .bind(discipline)
      .all<{ key: string }>(),
    db
      .prepare('SELECT key FROM scholar WHERE discipline = ?')
      .bind(discipline)
      .all<{ key: string }>(),
    db
      .prepare('SELECT tags_json FROM discipline WHERE key = ?')
      .bind(discipline)
      .first<{ tags_json: string | null }>(),
  ]);
  // v0.8.37: parse discipline.tags_json → key set
  const tagKeys: string[] = [];
  if (discRow?.tags_json) {
    try {
      const arr = JSON.parse(discRow.tags_json);
      if (Array.isArray(arr)) {
        for (const t of arr) {
          if (t && typeof t === 'object' && typeof t.key === 'string') tagKeys.push(t.key);
        }
      }
    } catch { /* tolerate malformed */ }
  }
  return {
    schools: new Set((schoolsRes.results ?? []).map((r) => r.key)),
    scholars: new Set((scholarsRes.results ?? []).map((r) => r.key)),
    tags: new Set(tagKeys),
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
 * Merged 内部状态：v0.8.10 Stage 5 起 KpApiRecord 已是 v0.8 shape（body 结构化），
 * 不再需要单独保存 structured 副本。保留 record + 派生 evaluations metadata。
 */
export interface MergedKpState {
  record: KpApiRecord;
  body: { zh: KpBody; ja?: KpBody };
  evaluations: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang };
}

/**
 * partial-by-language merge — title/body/evaluations 按 zh/ja 各自整体替换；
 * 数组字段整体替换；标量整体替换。
 *
 * @param current      当前 KP record（已是 v0.8 shape）
 * @param currentS     KP 结构化 shape（与 current.body / current.evaluations 等价，单独 query 防 race）
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

  // 仅含非空 evaluations 才放进 record（GET response 用）
  const evalForRecord: KpApiRecord['evaluations'] = (() => {
    const out: { zh?: KpEvaluationsLang; ja?: KpEvaluationsLang } = {};
    if (mergedEvaluations.zh && hasEvaluationsContent(mergedEvaluations.zh)) {
      out.zh = mergedEvaluations.zh;
    }
    if (mergedEvaluations.ja && hasEvaluationsContent(mergedEvaluations.ja)) {
      out.ja = mergedEvaluations.ja;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  })();

  const mergedRecord: KpApiRecord = {
    ...current,
    title: mergedTitle,
    body: mergedBody,
    schools: patch.schools ?? current.schools,
    scholars: patch.scholars ?? current.scholars,
    tags: patch.tags ?? current.tags,
    year: patch.year ?? current.year,
    evaluations: evalForRecord,
  };

  return {
    record: mergedRecord,
    body: mergedBody,
    evaluations: mergedEvaluations,
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
  // body 按语种整体比对（discriminated union 不再 sub-merge）— JSON.stringify 算结构等价
  for (const lang of ['zh', 'ja'] as const) {
    const before = current.body?.[lang];
    const after = merged.body?.[lang];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diff[`body.${lang}`] = { before, after };
    }
  }

  // evaluations.zh / evaluations.ja 整体比对（Record 整体替换语义）
  for (const lang of ['zh', 'ja'] as const) {
    const before = current.evaluations?.[lang];
    const after = merged.evaluations?.[lang];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diff[`evaluations.${lang}`] = { before, after };
    }
  }

  // 标量
  if (current.year !== merged.year) diff['year'] = { before: current.year, after: merged.year };

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
  const merged = state.record;

  const evalsZh = state.evaluations.zh;
  const evalsJa = state.evaluations.ja;
  const hasZh = hasEvaluationsContent(evalsZh);
  const hasJa = hasEvaluationsContent(evalsJa);

  const ftsTextZh = structuredToSearchText(state.body.zh);
  const ftsTextJa = state.body.ja ? structuredToSearchText(state.body.ja) : '';

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE kp SET
        year = ?, title_zh = ?, title_en = ?, title_ja = ?,
        tags_json = ?, updated_by = ?, updated_at = ?,
        body_zh_json = ?, body_ja_json = ?, evaluations_zh_json = ?, evaluations_ja_json = ?, body_format = ?
       WHERE id = ? AND COALESCE(tenant_id, discipline) = ? AND discipline = ?`,
    ).bind(
      merged.year ?? '',
      merged.title.zh,
      merged.title.en ?? null,
      merged.title.ja ?? null,
      JSON.stringify(merged.tags ?? []),
      userId,
      now,
      JSON.stringify(state.body.zh),
      state.body.ja ? JSON.stringify(state.body.ja) : null,
      hasZh && evalsZh ? JSON.stringify(evalsZh) : null,
      hasJa && evalsJa ? JSON.stringify(evalsJa) : null,
      state.body.zh.format,
      kpId,
      tenant.tenantId,
      tenant.discipline,
    ),
    db.prepare('DELETE FROM kp_school WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_scholar WHERE kp_id = ?').bind(kpId),
    db.prepare('DELETE FROM kp_fts WHERE id = ?').bind(kpId),
    db.prepare(
      'INSERT INTO kp_fts (id, title_zh, title_en, title_ja, body_zh, body_ja) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(kpId, merged.title.zh, merged.title.en ?? '', merged.title.ja ?? '', ftsTextZh, ftsTextJa),
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
  // v0.8.7 sanitize: 静默 strip 所有 <strong>/</strong>。见 migration-v0.8.md §11.
  const patch = deepStripStrong(parsedPatch.data);

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

  // 5b. v0.11.58 锁定保护 — locked KP 整条 skip（不影响其它条）
  if (current.locked_at) {
    const currentVersion = await getCurrentVersion(db, id);
    return { id, ok: false, reason: 'kp_locked', current_version: currentVersion };
  }

  // 5c. v0.11.66 revert v0.11.64+65 server-side ja 校验（UI 误伤），质量回 skill + daily loop

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
  const invalidSchools = merged.record.schools.filter((k) => !tenantKeys.schools.has(k));
  if (invalidSchools.length > 0) {
    return {
      id,
      ok: false,
      reason: 'school_not_in_tenant',
      current_version: currentVersion,
      detail: { invalid_keys: invalidSchools },
    };
  }
  const invalidScholars = merged.record.scholars.filter((k) => !tenantKeys.scholars.has(k));
  if (invalidScholars.length > 0) {
    return {
      id,
      ok: false,
      reason: 'scholar_not_in_tenant',
      current_version: currentVersion,
      detail: { invalid_keys: invalidScholars },
    };
  }

  // v0.8.37 Phase 3: 校验 tags 都在 discipline.tags 库里 — 仅当 patch.tags 显式传时
  // 才校验 (避免老脏数据卡住改 title 等无关字段)
  if (patch.tags !== undefined) {
    const invalidTags = patch.tags.filter((k) => !tenantKeys.tags.has(k));
    if (invalidTags.length > 0) {
      return {
        id,
        ok: false,
        reason: 'tag_not_in_library',
        current_version: currentVersion,
        detail: {
          unknown_keys: invalidTags,
          library_keys: [...tenantKeys.tags].slice(0, 20),
          message: `tag key 必须先在标签库注册才能引用。通过 POST /api/edit/discipline/${options.tenant.discipline}/tags 注册新 tag。`,
        },
      };
    }
  }

  // 10. dryRun → 计算 diff 返
  if (options.dryRun) {
    return {
      id,
      ok: true,
      current_version: currentVersion,
      diff: computeDiff(current, merged.record),
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
    changed_fields: Object.keys(computeDiff(current, merged.record)),
  };
}
