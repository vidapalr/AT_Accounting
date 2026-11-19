import Link from "next/link";

import { db } from "@/lib/db";
import { canAccess } from "@/lib/access";
import { loadOtherSide } from "@/lib/party-link";
import { customerBalance } from "@/lib/customer-balance";
import { inr } from "@/lib/reports/money";

/**
 * A short line on a supplier or customer page when the same person is on the other list too.
 * Shows only the one figure left after setting off both sides (never both sides at once).
 * Only for people allowed to see both sides.
 */
export default async function OtherSideNote(props: {
  businessId: number;
  role: string;
  supplierId?: number;
  customerId?: number;
}) {
  if (!canAccess(props.role, "both_sides")) return null;
  const who = props.supplierId ? { supplierId: props.supplierId } : props.customerId ? { customerId: props.customerId } : null;
  if (!who) return null;
  const other = await loadOtherSide(db, props.businessId, who);
  if (!other) return null;
  const { net } = await customerBalance(db, props.businessId, other.customerId, true);
  const words =
    net > 0n ? `After setting off both sides, they owe you ${inr(net)}.`
    : net < 0n ? `After setting off both sides, you owe them ${inr(-net)}.`
    : "After setting off both sides, nothing is owed either way.";
  return (
    <p className="no-print" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 8, padding: "10px 14px", margin: "10px 0" }}>
      <strong>{props.supplierId ? "Also a customer." : "Also a supplier."}</strong> {words}{" "}
      <Link href={`/accounting/both-sides/${other.supplierId}`}>See both sides</Link>
    </p>
  );
}
