import "server-only";

/** Shared by the shop's JSON endpoints: only accept JSON bodies, and find the caller's address. */
export async function readJson(request: Request): Promise<unknown | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}
export const callerIp = (request: Request) => (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
