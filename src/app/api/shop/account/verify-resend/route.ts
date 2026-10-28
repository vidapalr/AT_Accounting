import { getShopCustomer } from "@/lib/shop-account";
import { sendVerifyLink } from "@/lib/shop-verify";
import { tooManyTries } from "@/lib/shop-account-math";

const hits = new Map<string, number[]>();

export async function POST() {
  const me = await getShopCustomer();
  if (!me) return Response.json({ ok: false, error: "Please log in first." }, { status: 401 });
  if (tooManyTries(hits, `v:${me.id}`, Date.now(), 3, 60 * 60_000)) {
    return Response.json({ ok: false, error: "Too many requests. Please try again in a while." }, { status: 429 });
  }
  const sent = await sendVerifyLink(me.id).catch(() => false);
  return Response.json({ ok: true, sent });
}
