/**
 * GET /api/edit/health  —— 编辑器接通自检（v0.4.1）
 *
 * admin only。验证：
 *   1. GITHUB_PAT secret 是否在 env
 *   2. GITHUB_REPO 是否配置
 *   3. PAT 是否能读到目标仓库（GET /repos/{owner}/{repo}）
 *   4. PAT 当前 scope 是否含 contents（试探：HEAD /contents/v2/data/keiei/discipline.json）
 *
 * 用途：
 *   - 编辑入口（铅笔图标）渲染前 fetch 这里，503 → 灰显 + 提示
 *   - 部署后 admin 自测，避免「编辑保存才发现 PAT 没设」
 */

import type { APIRoute } from 'astro';

interface HealthOK {
  ok: true;
  repo: string;
  rate_limit_remaining: number | null;
}
interface HealthFail {
  ok: false;
  reason:
    | 'not_admin'
    | 'pat_missing'
    | 'repo_missing'
    | 'pat_invalid'
    | 'repo_unreachable'
    | 'contents_unreadable';
  detail?: string;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.isAdmin) {
    return json<HealthFail>(403, { ok: false, reason: 'not_admin' });
  }

  const env = locals.runtime.env;
  const pat = env.GITHUB_PAT;
  const repo = env.GITHUB_REPO;

  if (!pat) return json<HealthFail>(503, { ok: false, reason: 'pat_missing' });
  if (!repo) return json<HealthFail>(503, { ok: false, reason: 'repo_missing' });

  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'management-study-v2-editor',
  };

  // 1. 验 PAT + repo 可达
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (repoRes.status === 401) {
    return json<HealthFail>(502, { ok: false, reason: 'pat_invalid', detail: 'PAT 无效或已过期' });
  }
  if (repoRes.status === 404) {
    return json<HealthFail>(502, { ok: false, reason: 'repo_unreachable', detail: `repo ${repo} 不可达（PAT 无权限或仓库名错）` });
  }
  if (!repoRes.ok) {
    return json<HealthFail>(502, { ok: false, reason: 'repo_unreachable', detail: `GitHub ${repoRes.status}` });
  }

  // 2. 验 contents scope（HEAD 一个已知存在的 JSON）
  const probePath = 'v2/data/keiei/discipline.json';
  const contentsRes = await fetch(`https://api.github.com/repos/${repo}/contents/${probePath}`, {
    method: 'HEAD',
    headers,
  });
  if (contentsRes.status === 403 || contentsRes.status === 404) {
    return json<HealthFail>(502, { ok: false, reason: 'contents_unreadable', detail: 'PAT 缺 Contents 权限' });
  }

  const remaining = repoRes.headers.get('x-ratelimit-remaining');
  return json<HealthOK>(200, {
    ok: true,
    repo,
    rate_limit_remaining: remaining ? parseInt(remaining, 10) : null,
  });
};

function json<T>(status: number, body: T): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
