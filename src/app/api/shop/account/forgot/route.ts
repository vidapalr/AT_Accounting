import { requestReset } from "@/lib/shop-reset";
import { callerIp, readJson } from "@/lib/shop-api";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body === null) return Response.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  const result = await requestReset(body, callerIp(request));
  return Response.json(result, { status: result.ok ? 200 : 429 });
}
