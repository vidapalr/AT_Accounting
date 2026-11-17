import type { NextRequest } from "next/server";

/**
 * The address a form on this site posts from: https://<this host> in production, the request's own
 * origin in development. Used to refuse sign-in forms posted from other websites. Nothing is fixed
 * in code, so every company's own address works.
 */
export function siteOrigin(request: NextRequest): string {
  if (process.env.NODE_ENV !== "production") return request.nextUrl.origin;
  const host = (request.headers.get("host") ?? "").trim();
  return host ? `https://${host}` : request.nextUrl.origin;
}

/** True when the browser says the form came from this same site. */
export function fromThisSite(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === siteOrigin(request);
}
