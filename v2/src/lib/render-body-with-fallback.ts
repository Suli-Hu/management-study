/**
 * renderBodyWithFallback — Stage 2 渲染层切新列的 helper (v0.8.0)
 *
 * 行为（PRD §6.3 防线 1）：
 *   1. 优先读 body_zh_json (新列 structured)，schema 校验后调新 renderer
 *   2. 新列 NULL 或 schema 校验失败 → fallback 到旧 renderer (read body string + format)
 *   3. fallback 触发上 console.warn (相当于 sentry alert)，便于发现双写 bug
 *
 * 这是 Stage 2-4 期间所有渲染调用的统一入口。Stage 5 drop 旧列后，
 * fallback 分支会自然失效（body 旧列读不到）— 那时简化为直接调新 renderer。
 */

import { KpBody } from '~/schemas/kp-body-structured';
import { renderStructuredBody } from './render-body-structured';
import { renderBody, renderBodyForSchool, type KpFormat } from './render-body';

export function renderBodyWithFallback(opts: {
  /** 新列：结构化 body JSON（可能 NULL — backfill 未跑或新写入失败） */
  body_json: string | null;
  /** 旧列：DSL 字符串（fallback 用） */
  body_string: string;
  /** 旧列 format flag（fallback 用） */
  format: KpFormat;
  accentHex: string;
  /** 'detail' 默认（compare 走表格）/ 'school'（compare 走卡片） */
  variant?: 'detail' | 'school';
  /** KP id — 用于 fallback 告警时定位 */
  kp_id?: string;
}): string {
  const variant = opts.variant ?? 'detail';

  // 1. 试新列
  if (opts.body_json) {
    try {
      const parsed = JSON.parse(opts.body_json);
      const validated = KpBody.parse(parsed);
      return renderStructuredBody({
        body: validated,
        accentHex: opts.accentHex,
        variant,
      });
    } catch (e) {
      // 双写漏掉或写错（应被 Stage 4 漂移检测捕获），上告警 + 走 fallback
      console.warn('[KP_RENDER_FALLBACK]', {
        kp_id: opts.kp_id,
        reason: 'new_column_parse_failed',
        error: (e as Error).message,
      });
    }
  } else {
    // 新列空：backfill 未跑 / 新写入路径漏写新列
    console.warn('[KP_RENDER_FALLBACK]', {
      kp_id: opts.kp_id,
      reason: 'new_column_null',
    });
  }

  // 2. fallback 旧 renderer
  return variant === 'school'
    ? renderBodyForSchool({ fmt: opts.format, body: opts.body_string, accentHex: opts.accentHex })
    : renderBody({ fmt: opts.format, body: opts.body_string, accentHex: opts.accentHex });
}
