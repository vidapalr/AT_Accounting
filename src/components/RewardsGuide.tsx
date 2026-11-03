import { POINTS_PER_BLOCK, BLOCK_VALUE_PAISE } from "@/lib/rewards-math";

/** Plain-words steps for the person at the counter: how offers, coupons and points work. */
export default function RewardsGuide({ open = false }: { open?: boolean }) {
  const blockRupees = Number(BLOCK_VALUE_PAISE) / 100;
  return (
    <details open={open} className="no-print" style={{ border: "1px solid #c7d2fe", background: "#eef2ff", borderRadius: 8, padding: "10px 14px", margin: "10px 0" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>How offers, coupons and points work</summary>
      <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 8 }}>
        <p style={{ margin: "6px 0" }}><strong>One at a time.</strong> A bill can use only one of: a store offer, a coupon, or points. They cannot be added together. This is printed in the terms on the bill.</p>
        <p style={{ margin: "6px 0" }}><strong>Offer.</strong> Fills in the discount by itself when you pick the item. If an item has an offer discount, the coupon and points boxes are switched off.</p>
        <p style={{ margin: "6px 0" }}><strong>Coupon.</strong> Type the code the customer shows. It takes a % or a ₹ amount off the whole bill, only if the bill is big enough, in its dates, and at the branch it is for. Some coupons can be used once per customer.</p>
        <p style={{ margin: "6px 0" }}><strong>Earning points.</strong> Retail customers only (not wholesale). They get 1 point for every ₹200 of the bill, after discounts and without delivery. The screen shows how many this bill will earn.</p>
        <p style={{ margin: "6px 0" }}><strong>Using points.</strong> Every {POINTS_PER_BLOCK} points = ₹{blockRupees} off. Choose how many blocks from the list; it never takes more than the bill. Points are used up when the bill is confirmed.</p>
        <p style={{ margin: "6px 0" }}><strong>Returns.</strong> If goods come back, the points they earned are taken back too.</p>
      </div>
    </details>
  );
}
