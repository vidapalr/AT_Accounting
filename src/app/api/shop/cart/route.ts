import { currentLines } from "@/lib/shop-order";

/** Fresh price and stock for the items in a customer's cart. */
export async function POST(request: Request) {
  let ids: number[] = [];
  try {
    const body = (await request.json()) as { ids?: unknown };
    ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 30);
  } catch {
    /* empty cart */
  }
  return Response.json({ lines: await currentLines(ids) });
}
