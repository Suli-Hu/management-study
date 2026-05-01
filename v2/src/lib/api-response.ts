export function json<T>(status: number, body: T, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(body), { ...init, status, headers });
}

export function apiError(status: number, reason: string, detail?: unknown): Response {
  return noStore(json(status, {
    ok: false,
    reason,
    ...(detail === undefined ? {} : { detail }),
  }));
}

export function noStore(response: Response): Response {
  response.headers.set('cache-control', 'no-store');
  return response;
}
