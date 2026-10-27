import { placeOrder } from "@/lib/shop-order";
import { allowRequest } from "@/lib/shop-order-math";

const hits = new Map<string, number[]>();

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  if (!allowRequest(hits, ip, Date.now())) {
    return Response.json({ ok: false, error: "Too many orders from this connection. Please try again in a few minutes." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  }
  // Hidden field that real customers never fill; bots do.
  if (String((body as { website?: unknown })?.website ?? "") !== "") return Response.json({ ok: true, orderNo: "WEB-00000", total: 0 });
  const result = await placeOrder(body);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
