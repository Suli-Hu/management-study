/**
 * DEPRECATED: POST /api/v1/webhook/github  (v0.5.93)
 *
 * API-first 路线下，业务数据的写入入口是 /api/kps。此 webhook 仅保留给
 * 迁移期旧 GitHub JSON 工作流兜底使用。
 *
 * GitHub push event 接收 → 自动解析改动文件 → 调 syncResource / deleteResource。
 *
 * 配置（用户做）：
 *   1. Repo Settings → Webhooks → Add webhook
 *   2. Payload URL: https://management-study-v2.pages.dev/api/v1/webhook/github
 *   3. Content type: application/json
 *   4. Secret: 一段强随机串（≥32 字符）
 *   5. Events: 仅 "Just the push event"
 *   6. CF env var: 把同一 secret 设到 GITHUB_WEBHOOK_SECRET
 *
 * 验签：
 *   GitHub 在 X-Hub-Signature-256 header 发 sha256=<HMAC(secret, body)>，
 *   本端用 SubtleCrypto 算 HMAC SHA256 比对。timing-safe 比较。
 *
 * 解析 push event:
 *   - 跳过 ref ≠ refs/heads/main
 *   - 累加所有 commits 的 added/modified/removed
 *   - 文件路径 match v2/data/<discipline>/{kp,schools,scholars,views}/<id>.json
 *     的：upsert (added/modified) or delete (removed)
 *   - 其它路径忽略
 *
 * 容错：单条失败不阻断其它，最后返 summary。GH Actions 全量 sync 兜底。
 */

import type { APIRoute } from 'astro';
import { syncResource, deleteResource, detectResourceFromPath } from '~/lib/sync-resource';

interface PushCommit {
  added?: string[];
  modified?: string[];
  removed?: string[];
}
interface PushPayload {
  ref?: string;
  commits?: PushCommit[];
  head_commit?: { id?: string };
}

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'deprecation': 'true',
      'link': '</api/kps>; rel="successor-version"',
    },
  });
}

/** timing-safe 比较两个 hex 字符串 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifySignature(secret: string, rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader) return false;
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;
  const expected = signatureHeader.slice(prefix.length);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const actual = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(actual, expected);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env as { GITHUB_WEBHOOK_SECRET?: string; GITHUB_PAT?: string; GITHUB_REPO?: string; DB: D1Database };
  if (!env.GITHUB_WEBHOOK_SECRET || !env.GITHUB_PAT || !env.GITHUB_REPO) {
    return json(503, { ok: false, reason: 'config_missing', detail: 'GITHUB_WEBHOOK_SECRET / GITHUB_PAT / GITHUB_REPO 任一未配置' });
  }

  const rawBody = await request.text();
  const ok = await verifySignature(env.GITHUB_WEBHOOK_SECRET, rawBody, request.headers.get('x-hub-signature-256'));
  if (!ok) return json(401, { ok: false, reason: 'invalid_signature' });

  // 仅响应 push event
  const eventType = request.headers.get('x-github-event');
  if (eventType === 'ping') return json(200, { ok: true, msg: 'pong' });
  if (eventType !== 'push') return json(200, { ok: true, msg: 'event ignored', event: eventType });

  let payload: PushPayload;
  try { payload = JSON.parse(rawBody) as PushPayload; }
  catch { return json(400, { ok: false, reason: 'invalid_json' }); }

  // 仅处理 main 分支
  if (payload.ref !== 'refs/heads/main') {
    return json(200, { ok: true, msg: 'non-main ref ignored', ref: payload.ref });
  }

  // 累加所有 commit 的改动文件
  const added = new Set<string>();
  const modified = new Set<string>();
  const removed = new Set<string>();
  for (const c of payload.commits ?? []) {
    (c.added ?? []).forEach((p) => added.add(p));
    (c.modified ?? []).forEach((p) => modified.add(p));
    (c.removed ?? []).forEach((p) => {
      // 同一 push 里 added → modified → removed 的情况罕见但可能。
      // 以最终状态为准：removed 优先，从 added/modified 中扣掉。
      added.delete(p);
      modified.delete(p);
      removed.add(p);
    });
  }

  // 过滤出 v2/data 下的资源文件
  type FileOp = { op: 'upsert' | 'delete'; path: string };
  const ops: FileOp[] = [
    ...[...added, ...modified].map((p) => ({ op: 'upsert' as const, path: p })),
    ...[...removed].map((p) => ({ op: 'delete' as const, path: p })),
  ];

  const synced: unknown[] = [];
  const skipped: string[] = [];
  const failed: unknown[] = [];

  for (const { op, path } of ops) {
    const detect = detectResourceFromPath(path);
    if (!detect) {
      skipped.push(path);
      continue;
    }
    try {
      const env2 = { GITHUB_PAT: env.GITHUB_PAT, GITHUB_REPO: env.GITHUB_REPO, DB: env.DB };
      const result = op === 'upsert'
        ? await syncResource(env2, detect.type, detect.discipline, detect.idOrKey)
        : await deleteResource(env2, detect.type, detect.discipline, detect.idOrKey);
      if (result.ok) synced.push({ op, ...result });
      else failed.push({ op, ...result });
    } catch (e) {
      failed.push({ op, path, error: String(e) });
    }
  }

  return json(200, {
    ok: true,
    head_commit: payload.head_commit?.id ?? null,
    synced_count: synced.length,
    skipped_count: skipped.length,
    failed_count: failed.length,
    synced,
    failed,
    skipped,
  });
};
