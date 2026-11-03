// Offers for the store and the online shop. Pure maths, money in paise.
export type Offer = {
  id: number;
  name: string;
  channel: "STORE" | "ONLINE" | "BOTH";
  kind: "PERCENT" | "AMOUNT_OFF" | "FIXED_PRICE";
  value: number; // percent, rupees off, or the fixed rupee price
  scope: "ALL" | "FABRIC" | "PRODUCTS";
  fabric: string | null;
  productIds: number[];
  startsOn: string | null; // YYYY-MM-DD
  endsOn: string | null;
  active: boolean;
  /** Where it works: one branch, every branch of a division, or (both empty) everywhere. */
  divisionId?: number | null;
  branchId?: number | null;
};

/** The branch a store sale is made at. */
export type OfferWhere = { branchId: number | null; divisionId: number | null };

export type OfferTarget = { productId: number; fabric: string | null };

export function offerApplies(o: Offer, channel: "STORE" | "ONLINE", t: OfferTarget, today: string, where?: OfferWhere): boolean {
  if (!o.active) return false;
  if (channel === "STORE") {
    if (o.branchId && (!where || where.branchId !== o.branchId)) return false;
    if (!o.branchId && o.divisionId && (!where || where.divisionId !== o.divisionId)) return false;
  } else if (o.branchId) {
    return false; // the website is not a branch
  }
  if (o.channel !== "BOTH" && o.channel !== channel) return false;
  if (o.startsOn && today < o.startsOn) return false;
  if (o.endsOn && today > o.endsOn) return false;
  if (o.scope === "ALL") return true;
  if (o.scope === "FABRIC") return Boolean(o.fabric) && (t.fabric ?? "").toLowerCase() === (o.fabric ?? "").toLowerCase();
  return o.productIds.includes(t.productId);
}

/** Price after one offer, in paise. Never below zero and never above the original. */
export function priceAfter(pricePaise: bigint, o: Pick<Offer, "kind" | "value">): bigint {
  let next = pricePaise;
  if (o.kind === "PERCENT") next = pricePaise - (pricePaise * BigInt(Math.round(o.value * 100))) / 10000n;
  else if (o.kind === "AMOUNT_OFF") next = pricePaise - BigInt(Math.round(o.value * 100));
  else next = BigInt(Math.round(o.value * 100));
  if (next < 0n) next = 0n;
  return next > pricePaise ? pricePaise : next;
}

/** The single best (lowest price) offer for an item; offers never stack. */
export function bestOffer(
  offers: Offer[], channel: "STORE" | "ONLINE", t: OfferTarget, pricePaise: bigint, today: string, where?: OfferWhere
): { offer: Offer; newPaise: bigint; offPaise: bigint } | null {
  let best: { offer: Offer; newPaise: bigint; offPaise: bigint } | null = null;
  for (const o of offers) {
    if (!offerApplies(o, channel, t, today, where)) continue;
    const newPaise = priceAfter(pricePaise, o);
    if (newPaise >= pricePaise) continue;
    if (!best || newPaise < best.newPaise) best = { offer: o, newPaise, offPaise: pricePaise - newPaise };
  }
  return best;
}

export function describeOffer(o: Pick<Offer, "kind" | "value">): string {
  if (o.kind === "PERCENT") return `${o.value}% off`;
  if (o.kind === "AMOUNT_OFF") return `₹${o.value} off`;
  return `Special price ₹${o.value}`;
}
