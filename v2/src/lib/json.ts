/**
 * Shared JSON response helpers.
 *
 * - Always sets `content-type: application/json`
 * - Optionally mirrors docs headers into error JSON body for clients that ignore headers
 */
 
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function maybeInjectDocsIntoErrorBody<T>(body: T, headers: Headers): T {
  if (!isPlainObject(body)) return body;
  if (body.ok !== false) return body;
  if (typeof body.docs === 'string' && body.docs.length > 0) return body as T;
  const docs = headers.get('x-ms-docs');
  if (!docs) return body as T;
  return { ...body, docs } as T;
}

export function jsonRes<T>(status: number, body: T): Response {
  return jsonResWithInit(status, body);
}

export function jsonResWithInit<T>(status: number, body: T, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  const nextBody = maybeInjectDocsIntoErrorBody(body, headers);
  return new Response(JSON.stringify(nextBody), {
    ...init,
    status,
    headers,
  });
}

