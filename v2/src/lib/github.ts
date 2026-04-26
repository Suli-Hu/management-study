/**
 * GitHub Contents API 客户端 (v0.4.2)
 *
 * 用于编辑器把 data/<discipline>/kp/<id>.json 写回 GitHub。
 * 所有调用都带乐观锁（GET 拿 sha → PUT 必须带相同 sha，否则 409）。
 *
 * 文档：https://docs.github.com/rest/repos/contents
 */

const GH_API = 'https://api.github.com';
const UA = 'management-study-v2-editor';

interface GhConfig {
  pat: string;
  repo: string; // "Suli-Hu/management-study"
}

export interface GhFile {
  sha: string;
  /** decoded UTF-8 content */
  content: string;
}

export type GhResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; reason: GhErrorReason; detail?: string };

export type GhErrorReason = 'not_found' | 'unauthorized' | 'conflict' | 'rate_limit' | 'unknown';

function headers(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
  };
}

function classifyError(status: number): GhErrorReason {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 412 || status === 422) return 'conflict';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

/** GET 文件 → 返 sha + decoded content。404 时返 not_found（用于「新建」分支）。 */
export async function getFile(cfg: GhConfig, path: string): Promise<GhResult<GhFile>> {
  const res = await fetch(`${GH_API}/repos/${cfg.repo}/contents/${path}`, { headers: headers(cfg.pat) });
  if (!res.ok) {
    return { ok: false, status: res.status, reason: classifyError(res.status), detail: await res.text().catch(() => '') };
  }
  const json = (await res.json()) as { sha: string; content: string; encoding: string };
  if (json.encoding !== 'base64') {
    return { ok: false, status: 500, reason: 'unknown', detail: `unexpected encoding: ${json.encoding}` };
  }
  // GitHub returns base64 with embedded newlines — strip them before decoding
  const decoded = atob(json.content.replace(/\n/g, ''));
  // atob → binary string；UTF-8 还原走 TextDecoder
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  const content = new TextDecoder('utf-8').decode(bytes);
  return { ok: true, data: { sha: json.sha, content } };
}

/**
 * PUT 文件（更新现有 or 新建）。带 sha = 更新，不带 = 新建（404 不存在时）。
 *
 * 失败 422 通常意味着 sha 与远端不一致 → 当 conflict 处理。
 */
export async function putFile(
  cfg: GhConfig,
  path: string,
  body: { content: string; message: string; sha?: string; branch?: string },
): Promise<GhResult<{ commit_sha: string; new_blob_sha: string }>> {
  // 用 TextEncoder + base64 (Cloudflare Workers 没 Buffer)
  const bytes = new TextEncoder().encode(body.content);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const contentB64 = btoa(bin);

  const payload: Record<string, unknown> = {
    message: body.message,
    content: contentB64,
  };
  if (body.sha) payload.sha = body.sha;
  if (body.branch) payload.branch = body.branch;

  const res = await fetch(`${GH_API}/repos/${cfg.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(cfg.pat), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { ok: false, status: res.status, reason: classifyError(res.status), detail };
  }
  const json = (await res.json()) as { commit: { sha: string }; content: { sha: string } };
  return { ok: true, data: { commit_sha: json.commit.sha, new_blob_sha: json.content.sha } };
}

/** DELETE 文件（v0.4.4 用，本期保留接口）。 */
export async function deleteFile(
  cfg: GhConfig,
  path: string,
  body: { message: string; sha: string; branch?: string },
): Promise<GhResult<{ commit_sha: string }>> {
  const res = await fetch(`${GH_API}/repos/${cfg.repo}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...headers(cfg.pat), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, reason: classifyError(res.status), detail: await res.text().catch(() => '') };
  }
  const json = (await res.json()) as { commit: { sha: string } };
  return { ok: true, data: { commit_sha: json.commit.sha } };
}

/**
 * 多文件原子 commit（v0.4.30 跨组拖动用）
 *   通过 Tree API 在单次 commit 中更新多个 file。
 *   流程：refs/heads/main → commit → tree → blob × N → tree(new) → commit(new) → ref(update)
 *
 *   files: [{ path, content }] — content 是 utf-8 字符串
 */
export async function commitMultipleFiles(
  cfg: GhConfig,
  files: Array<{ path: string; content: string }>,
  message: string,
  branch = 'main',
): Promise<GhResult<{ commit_sha: string }>> {
  const h = { ...headers(cfg.pat), 'content-type': 'application/json' };

  // 1. ref → latest commit sha
  const refRes = await fetch(`${GH_API}/repos/${cfg.repo}/git/refs/heads/${branch}`, { headers: h });
  if (!refRes.ok) return { ok: false, status: refRes.status, reason: classifyError(refRes.status), detail: await refRes.text().catch(() => '') };
  const refJson = (await refRes.json()) as { object: { sha: string } };
  const latestCommitSha = refJson.object.sha;

  // 2. commit → tree sha
  const commitRes = await fetch(`${GH_API}/repos/${cfg.repo}/git/commits/${latestCommitSha}`, { headers: h });
  if (!commitRes.ok) return { ok: false, status: commitRes.status, reason: classifyError(commitRes.status), detail: await commitRes.text().catch(() => '') };
  const commitJson = (await commitRes.json()) as { tree: { sha: string } };
  const baseTreeSha = commitJson.tree.sha;

  // 3. 每个 file 新建一个 blob
  const treeEntries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  for (const f of files) {
    const blobRes = await fetch(`${GH_API}/repos/${cfg.repo}/git/blobs`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
    });
    if (!blobRes.ok) return { ok: false, status: blobRes.status, reason: classifyError(blobRes.status), detail: await blobRes.text().catch(() => '') };
    const blobJson = (await blobRes.json()) as { sha: string };
    treeEntries.push({ path: f.path, mode: '100644', type: 'blob', sha: blobJson.sha });
  }

  // 4. 新 tree
  const treeRes = await fetch(`${GH_API}/repos/${cfg.repo}/git/trees`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!treeRes.ok) return { ok: false, status: treeRes.status, reason: classifyError(treeRes.status), detail: await treeRes.text().catch(() => '') };
  const treeJson = (await treeRes.json()) as { sha: string };

  // 5. 新 commit
  const newCommitRes = await fetch(`${GH_API}/repos/${cfg.repo}/git/commits`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ message, tree: treeJson.sha, parents: [latestCommitSha] }),
  });
  if (!newCommitRes.ok) return { ok: false, status: newCommitRes.status, reason: classifyError(newCommitRes.status), detail: await newCommitRes.text().catch(() => '') };
  const newCommitJson = (await newCommitRes.json()) as { sha: string };

  // 6. 更新 ref（fast-forward only — 若并发 push 已 advance 则失败，相当于 sha_conflict）
  const updateRes = await fetch(`${GH_API}/repos/${cfg.repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: h,
    body: JSON.stringify({ sha: newCommitJson.sha, force: false }),
  });
  if (!updateRes.ok) return { ok: false, status: updateRes.status, reason: classifyError(updateRes.status), detail: await updateRes.text().catch(() => '') };

  return { ok: true, data: { commit_sha: newCommitJson.sha } };
}
