type HeadersLike = Pick<Headers, "get">;

type RequestLike = {
  headers: HeadersLike;
  url?: string;
  nextUrl?: { origin?: string };
};

export type RequestGuardResult =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

function requestOrigin(request: RequestLike): string | null {
  if (request.nextUrl?.origin) return request.nextUrl.origin;
  if (!request.url) return null;
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

function headerOrigin(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Lightweight CSRF guard for high-risk same-origin JSON routes. Browsers send an
 * Origin header on credentialed cross-site fetches and Sec-Fetch-Site on modern
 * requests; native/WebView same-origin calls should pass both checks. Missing
 * Origin/Referer is allowed for older clients, but explicit cross-site signals
 * are rejected.
 */
export function validateDestructiveRequest(request: RequestLike): RequestGuardResult {
  const expectedOrigin = requestOrigin(request);
  if (!expectedOrigin) return { ok: false, status: 400, error: "Invalid request origin" };

  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase() ?? null;
  if (secFetchSite === "cross-site") {
    return { ok: false, status: 403, error: "Cross-site request rejected" };
  }

  const origin = headerOrigin(request.headers.get("origin"));
  if (origin && origin !== expectedOrigin) {
    return { ok: false, status: 403, error: "Cross-site request rejected" };
  }

  const referer = headerOrigin(request.headers.get("referer"));
  if (!origin && referer && referer !== expectedOrigin) {
    return { ok: false, status: 403, error: "Cross-site request rejected" };
  }

  return { ok: true };
}

export function hasConfirmation(body: unknown, expected: string): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "confirm" in body &&
    (body as { confirm?: unknown }).confirm === expected
  );
}
