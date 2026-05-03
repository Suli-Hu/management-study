/**
 * GET /api/kps/empty-body?format=<format> — v0.8.0 Stage 3 新增。
 *
 * 返该 format 的空白 KpBody 模板，给"新建 KP / 切 format"起手用。
 * 详 v2/public/docs/migration-v0.8.md §6。
 *
 * 鉴权：需 read 权限即可（只是模板，无 tenant 数据）。
 */

import type { APIRoute } from 'astro';
import { json, noStore } from '~/lib/api-response';
import { resolveTenantContext } from '~/lib/tenant-context';
import { emptyKpBody } from '~/lib/kp-body-helpers';
import type { Format } from '~/lib/body-parser';

const VALID_FORMATS: Format[] = ['narrative', 'flat-list', 'accordion', 'compare', 'quad'];

export const GET: APIRoute = async (context) => {
  const tenant = await resolveTenantContext(context, 'read');
  if (!tenant.ok) return noStore(json(tenant.status, { ok: false, reason: tenant.reason }));

  const url = new URL(context.request.url);
  const format = url.searchParams.get('format');
  if (!format) {
    return noStore(
      json(400, {
        ok: false,
        reason: 'format_required',
        message: 'Query param `format` is required. Valid values: narrative | flat-list | accordion | compare | quad.',
      }),
    );
  }
  if (!VALID_FORMATS.includes(format as Format)) {
    return noStore(
      json(400, {
        ok: false,
        reason: 'format_invalid',
        message: `format must be one of: ${VALID_FORMATS.join(' | ')}.`,
        detail: { got: format, valid: VALID_FORMATS },
      }),
    );
  }

  return noStore(json(200, { ok: true, body: emptyKpBody(format as Format) }));
};
