import { registerCustomer } from "@/lib/shop-account";
import { callerIp, readJson } from "@/lib/shop-api";
import { safeNext } from "@/lib/shop-account-math";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === null) return Response.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  const result = await registerCustomer(body, callerIp(request));
  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json({ ok: true, next: safeNext((body as { next?: unknown }).next) });
}
