/**
 * study_session 表 CRUD helpers（v0.5.2 / v0.7.12）
 *
 * 所有 helper 都是 per-user scoped：调用方传 userId，store 用 user_id
 * 在 WHERE 里限定 —— 即使知道别人的 session id 也读/改不到（防 IDOR）。
 *
 * kp_id 引用 v2 KP 数据；migration 0016 配的是 ON DELETE SET NULL，
 * 所以 KP 被删后 session 仍保留（kp_id = NULL）。创建 / patch 时
 * 调用方负责先校验 KP 存在 + discipline 匹配（参考 ensureKpInDiscipline）。
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface StudySessionRow {
  id: string;
  user_id: string;
  discipline: string;
  kp_id: string | null;
  date: string;          // YYYY-MM-DD
  start_time: string;    // HH:mm
  duration_min: number;
  rating: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListOptions {
  discipline?: string;   // undefined = 跨学科返回该 user 全部
  from?: string;         // YYYY-MM-DD inclusive
  to?: string;           // YYYY-MM-DD inclusive
  limit?: number;        // 默认 200，max 1000
  offset?: number;
}

// ============================================================
// 工具
// ============================================================

function generateSessionId(): string {
  // 16 chars base62 nanoid-ish; 'ss_' 前缀方便日志识别
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let s = '';
  for (let i = 0; i < buf.length; i++) s += chars[buf[i] % chars.length];
  return `ss_${s}`;
}

// ============================================================
// KP 存在 + discipline 匹配校验
// ============================================================

export type KpCheckResult =
  | { ok: true }
  | { ok: false; reason: 'kp_not_found' | 'kp_discipline_mismatch'; actualDiscipline?: string };

/** 给定 kp_id + 期望 discipline，确认 KP 存在且属于该 discipline */
export async function ensureKpInDiscipline(
  db: D1Database,
  kpId: string,
  discipline: string,
): Promise<KpCheckResult> {
  const row = await db
    .prepare('SELECT discipline FROM kp WHERE id = ?')
    .bind(kpId)
    .first<{ discipline: string }>();
  if (!row) return { ok: false, reason: 'kp_not_found' };
  if (row.discipline !== discipline) {
    return { ok: false, reason: 'kp_discipline_mismatch', actualDiscipline: row.discipline };
  }
  return { ok: true };
}

// ============================================================
// CRUD
// ============================================================

export async function createStudySession(
  db: D1Database,
  userId: string,
  input: {
    discipline: string;
    kp_id: string;
    date: string;
    start_time: string;
    duration_min: number;
    rating: number | null;
    note: string | null;
  },
): Promise<StudySessionRow> {
  const id = generateSessionId();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO study_session
         (id, user_id, discipline, kp_id, date, start_time, duration_min, rating, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, userId, input.discipline, input.kp_id, input.date, input.start_time,
      input.duration_min, input.rating, input.note, now, now,
    )
    .run();
  return {
    id, user_id: userId,
    discipline: input.discipline, kp_id: input.kp_id,
    date: input.date, start_time: input.start_time, duration_min: input.duration_min,
    rating: input.rating, note: input.note,
    created_at: now, updated_at: now,
  };
}

export async function getStudySession(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<StudySessionRow | null> {
  return db
    .prepare('SELECT * FROM study_session WHERE id = ? AND user_id = ?')
    .bind(sessionId, userId)
    .first<StudySessionRow>();
}

export async function listStudySessions(
  db: D1Database,
  userId: string,
  opts: ListOptions = {},
): Promise<StudySessionRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);

  const where: string[] = ['user_id = ?'];
  const binds: unknown[] = [userId];

  if (opts.discipline) {
    where.push('discipline = ?');
    binds.push(opts.discipline);
  }
  if (opts.from) {
    where.push('date >= ?');
    binds.push(opts.from);
  }
  if (opts.to) {
    where.push('date <= ?');
    binds.push(opts.to);
  }

  const sql = `
    SELECT * FROM study_session
    WHERE ${where.join(' AND ')}
    ORDER BY date DESC, start_time DESC, id DESC
    LIMIT ? OFFSET ?
  `;
  binds.push(limit, offset);

  const result = await db.prepare(sql).bind(...binds).all<StudySessionRow>();
  return result.results ?? [];
}

export async function updateStudySession(
  db: D1Database,
  userId: string,
  sessionId: string,
  patch: Partial<{
    kp_id: string;
    date: string;
    start_time: string;
    duration_min: number;
    rating: number | null;
    note: string | null;
  }>,
): Promise<StudySessionRow | null> {
  // 先确认 session 归属（防 IDOR）
  const existing = await getStudySession(db, userId, sessionId);
  if (!existing) return null;

  const set: string[] = [];
  const binds: unknown[] = [];
  if (patch.kp_id !== undefined) { set.push('kp_id = ?'); binds.push(patch.kp_id); }
  if (patch.date !== undefined) { set.push('date = ?'); binds.push(patch.date); }
  if (patch.start_time !== undefined) { set.push('start_time = ?'); binds.push(patch.start_time); }
  if (patch.duration_min !== undefined) { set.push('duration_min = ?'); binds.push(patch.duration_min); }
  if (patch.rating !== undefined) { set.push('rating = ?'); binds.push(patch.rating); }
  if (patch.note !== undefined) { set.push('note = ?'); binds.push(patch.note); }

  if (set.length === 0) return existing;

  const now = new Date().toISOString();
  set.push('updated_at = ?');
  binds.push(now);
  binds.push(sessionId, userId);

  await db
    .prepare(`UPDATE study_session SET ${set.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...binds)
    .run();

  return getStudySession(db, userId, sessionId);
}

export async function deleteStudySession(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM study_session WHERE id = ? AND user_id = ?')
    .bind(sessionId, userId)
    .run();
  const meta = result.meta as { changes?: number } | undefined;
  return (meta?.changes ?? 0) > 0;
}
