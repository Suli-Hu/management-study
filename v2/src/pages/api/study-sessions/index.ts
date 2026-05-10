/**
 * /api/study-sessions  (v0.5.2 / v0.7.12)
 *
 *   GET   list 该 user 的 sessions
 *         query: ?discipline=&from=&to=&limit=&offset=
 *   POST  create 一条 session
 *         body: { discipline, kp_id, date, start_time, duration_min, rating?, note? }
 *
 * 必须登录。study_session 是 per-user 私有数据，不分 admin/guest 权限
 * （任何登录用户都可以读写自己的 session）。
 */

import type { APIRoute } from 'astro';
import { json, noStore, apiError } from '~/lib/api-response';
import { StudySessionInput } from '~/schemas/study-session';
import {
  createStudySession,
  listStudySessions,
  ensureKpInDiscipline,
  ensureSchoolInDiscipline,
} from '~/lib/study-session-store';

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return apiError(401, 'not_authenticated');
  const env = locals.runtime.env;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? '200');
  const offsetRaw = Number(url.searchParams.get('offset') ?? '0');

  const sessions = await listStudySessions(env.DB, locals.user.id, {
    discipline: url.searchParams.get('discipline') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    limit: Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 200,
    offset: Number.isFinite(offsetRaw) ? Math.floor(offsetRaw) : 0,
  });

  return noStore(json(200, { ok: true, sessions }));
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return apiError(401, 'not_authenticated');
  const env = locals.runtime.env;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, 'bad_request', 'invalid json body');
  }

  const parsed = StudySessionInput.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, 'invalid_input', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const input = parsed.data;

  let kpId: string | null = null;
  let schoolKey: string | null = null;
  if (input.kp_id) {
    const kpCheck = await ensureKpInDiscipline(env.DB, input.kp_id, input.discipline);
    if (!kpCheck.ok) {
      return apiError(
        kpCheck.reason === 'kp_not_found' ? 404 : 400,
        kpCheck.reason,
        kpCheck.reason === 'kp_discipline_mismatch'
          ? `kp_id ${input.kp_id} 实际属于 ${kpCheck.actualDiscipline}`
          : undefined,
      );
    }
    kpId = input.kp_id;
  } else if (input.school_key) {
    const schCheck = await ensureSchoolInDiscipline(env.DB, input.school_key, input.discipline);
    if (!schCheck.ok) {
      return apiError(
        schCheck.reason === 'school_not_found' ? 404 : 400,
        schCheck.reason,
        schCheck.reason === 'school_discipline_mismatch'
          ? `school_key ${input.school_key} 实际属于 ${schCheck.actualDiscipline}`
          : undefined,
      );
    }
    schoolKey = input.school_key;
  }

  const created = await createStudySession(env.DB, locals.user.id, {
    discipline: input.discipline,
    kp_id: kpId,
    school_key: schoolKey,
    date: input.date,
    start_time: input.start_time,
    duration_min: input.duration_min,
    rating: input.rating ?? null,
    note: input.note ?? null,
  });

  return noStore(json(200, { ok: true, session: created }));
};
