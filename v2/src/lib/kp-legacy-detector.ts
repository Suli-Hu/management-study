/**
 * v0.8.0 Stage 3 — KP API 旧 contract 输入识别 (zod parse 前跑)
 *
 * PM 决策（详见 v2/public/docs/migration-v0.8.md §7）：
 *   不要用 z.union 兼容老 schema。先用 plain object 检查识别老形状，返清晰
 *   reason，再 zod parse 新形状。这样调用方拿到的 4xx 不是泛的 `schema_invalid`，
 *   而是具体的"哪里旧了 + 看哪里"。
 *
 * 6 个 reason（migration-v0.8.md §7.1）：
 *   - legacy_top_level_format    payload 含顶层 format 字段
 *   - legacy_string_body          body.zh / body.ja 是 string
 *   - legacy_evalcontent_field    payload 含 evalContent key
 *   - legacy_eval_in_body         body 内含 ◆评价—— 段（lead / prose / item.desc 等）
 *   - body_format_invalid         body.zh.format 不在 5 种枚举（zod parse 后判别）
 *   - body_structure_invalid      形状对但内部不合法 (quad cells != 4 / flat-list items 空 等，zod parse 后判别)
 *
 * 前 4 个由本文件 detectLegacyContract 返回；后 2 个由 classifyZodFailure
 * 在 zod parse 失败时分类。
 */

import type { z } from 'zod';
import { EVAL_DEFS } from './body-parser';

const MIGRATION_GUIDE_URL = 'https://study.sususu.org/docs/migration-v0.8.md';

export type LegacyContractReason =
  | 'legacy_top_level_format'
  | 'legacy_string_body'
  | 'legacy_evalcontent_field'
  | 'legacy_eval_in_body';

export type StructureFailureReason =
  | 'body_format_invalid'
  | 'body_structure_invalid'
  | 'schema_invalid';

export interface LegacyDetection {
  reason: LegacyContractReason;
  message: string;
  detail?: unknown;
}

/**
 * 跑在 zod parse 之前。返 null = 形状看起来是新 contract（zod 接管细节校验）；
 * 返 object = 命中旧 contract 信号，应直接 422 拒。
 *
 * batch endpoint 用 detectLegacyContractInBatch — 每条 update 单独跑。
 */
export function detectLegacyContract(payload: unknown): LegacyDetection | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  if ('format' in p) {
    return {
      reason: 'legacy_top_level_format',
      message:
        'v0.8.0 起 format 字段已移到 body.{zh,ja}.format。删掉顶层 format 字段，把它放进 body 内。详见 /docs/migration-v0.8.md §3。',
    };
  }

  if ('evalContent' in p) {
    return {
      reason: 'legacy_evalcontent_field',
      message:
        'v0.8.0 起 evalContent 已改名 evaluations，且 6 个子 key 从中文汉字（义/限/例/应/用/喻）改成英文（meaning/limit/example/response/application/analogy）。详见 /docs/migration-v0.8.md §4。',
    };
  }

  if ('body' in p && typeof p.body === 'string') {
    return {
      reason: 'legacy_string_body',
      message:
        'v0.8.0 起 body 必须是 { zh: KpBody, ja?: KpBody } 形状，不能是顶层 string。详见 /docs/migration-v0.8.md §3。',
    };
  }

  if ('body' in p && p.body && typeof p.body === 'object') {
    const body = p.body as Record<string, unknown>;
    if (typeof body.zh === 'string' || typeof body.ja === 'string') {
      return {
        reason: 'legacy_string_body',
        message:
          'v0.8.0 起 body.zh / body.ja 必须是结构化对象（KpBody，按 format discriminated union），不再接受 string。详见 /docs/migration-v0.8.md §3。',
      };
    }
    const langWithEvalMarker = findLegacyEvalMarkerLang(body);
    if (langWithEvalMarker) {
      return {
        reason: 'legacy_eval_in_body',
        message: `body.${langWithEvalMarker} 内含 ◆评价—— 段。v0.8.0 起评价必须独立写到 evaluations.${langWithEvalMarker}.{meaning,limit,example,response,application,analogy}，body 内禁止 ◆评价——。详见 /docs/migration-v0.8.md §4.3。`,
      };
    }
  }

  return null;
}

/** 返 'zh' / 'ja' / null — 哪个语种 body 里含 ◆评价—— 段。 */
function findLegacyEvalMarkerLang(body: Record<string, unknown>): 'zh' | 'ja' | null {
  if (containsLegacyEvalMarker(body.zh)) return 'zh';
  if (containsLegacyEvalMarker(body.ja)) return 'ja';
  return null;
}

/**
 * 直接复用 EVAL_DEFS 的别名集合（单一真源） — EVAL_DEFS 加新别名时这里自动跟，
 * 不再需要在两处维护硬编码列表。
 */
const LEGACY_EVAL_MARKER_PATTERN = (() => {
  const aliases = EVAL_DEFS.flatMap((d) => d.aliases).map((a) =>
    a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  return new RegExp(`◆\\s*(${aliases.join('|')})\\s*—{2,}`);
})();

function containsLegacyEvalMarker(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return LEGACY_EVAL_MARKER_PATTERN.test(value);
  if (typeof value === 'object') {
    return LEGACY_EVAL_MARKER_PATTERN.test(JSON.stringify(value));
  }
  return false;
}

/**
 * zod parse 失败后分类成 body_format_invalid / body_structure_invalid / schema_invalid (F4)。
 *
 * 分类规则（v0.8.2 F4 修复）：
 *   - body_format_invalid: issue.code='invalid_union_discriminator' + path 触及 body
 *     （format 不在 5 枚举之一）
 *   - body_structure_invalid: 任一 issue path 触及 body（quad cells != 4 / flat-list
 *     items 空 / body 内字段类型错等）
 *   - schema_invalid: 所有 issue 都不触及 body（如 KpId 非法 / title 缺 / schools 非法 /
 *     未知顶层 key 等 — 这些是 schema 层错，跟 body 结构无关）
 *
 * v0.8.0 (Stage 3) 起 default 是 body_structure_invalid，但 T6.3 类的"非 body path
 * zod fail"（如 KpId 非法）也被归到 body_structure_invalid，语义不准。F4 修复成默认
 * schema_invalid，仅 path 触及 body 的归 body_*。
 */
export function classifyZodFailure(error: z.ZodError): {
  reason: StructureFailureReason;
  detail: unknown;
} {
  let touchesBody = false;
  for (const issue of error.issues) {
    if (pathTouchesBody(issue.path)) {
      touchesBody = true;
      if (issue.code === 'invalid_union_discriminator') {
        return { reason: 'body_format_invalid', detail: error.issues };
      }
    }
  }
  if (touchesBody) {
    return { reason: 'body_structure_invalid', detail: error.issues };
  }
  return { reason: 'schema_invalid', detail: error.issues };
}

function pathTouchesBody(path: (string | number)[]): boolean {
  if (path.length < 1) return false;
  // path 形如 ['body', 'zh', ...] — single endpoint 的 issue
  const head = String(path[0] ?? '');
  if (head === 'body') return true;
  // batch 路径 ['updates', i, 'patch', 'body', ...]
  if (head === 'updates') return path.includes('body');
  return false;
}

/** 统一 4xx response body — 5 个 endpoint 共用。 */
export function legacyContractResponseBody(detection: LegacyDetection) {
  return {
    ok: false as const,
    reason: detection.reason,
    message: detection.message,
    migration_guide: MIGRATION_GUIDE_URL,
    ...(detection.detail !== undefined ? { detail: detection.detail } : {}),
  };
}

export function structureFailureResponseBody(
  reason: StructureFailureReason,
  detail: unknown,
) {
  const message =
    reason === 'body_format_invalid'
      ? 'body.{zh,ja}.format 必须是 narrative | flat-list | accordion | compare | quad 之一。'
      : reason === 'body_structure_invalid'
        ? 'body 形状对应了 format 但内部字段不合法（如 quad cells 必须正好 4 个、flat-list items 至少 1 个）。详见 detail 中的 zod issue path/message。'
        : 'payload 不符合 KP schema（非 body 字段错 — 如 id 格式 / title 缺 / schools 非法等）。详见 detail 中的 zod issue path/message。';
  return {
    ok: false as const,
    reason,
    message,
    migration_guide: MIGRATION_GUIDE_URL,
    detail,
  };
}

export { MIGRATION_GUIDE_URL };
