import Link from "next/link";

import { db } from "@/lib/db";
import { canAccess } from "@/lib/access";
import { loadOtherSide } from "@/lib/party-link";
import { netSentence } from "@/lib/setoff-math";

const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;

/**
 * A short line on a supplier or customer page when the same person is on the other list too:
 * what they owe us, what we owe them, and the net. Only for people allowed to see both sides.
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
  return (
    <p className="no-print" style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 8, padding: "10px 14px", margin: "10px 0" }}>
      <strong>{props.supplierId ? "Also a customer." : "Also a supplier."}</strong>{" "}
      {netSentence(other.theyOweUs, other.weOweThem, rupees)}{" "}
      <Link href={`/accounting/both-sides/${other.supplierId}`}>See both sides</Link>
    </p>
  );
}
