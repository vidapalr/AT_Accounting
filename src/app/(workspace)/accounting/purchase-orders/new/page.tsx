import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { loadOrderChoices } from "@/lib/purchase-order-data";
import { todayInIndia } from "@/lib/reports/money";
import PurchaseOrderForm from "../PurchaseOrderForm";

type Props = { searchParams: Promise<{ error?: string }> };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("purchases");
  const divisionId = await getActiveDivisionId(user);
  const choices = await loadOrderChoices(user.legal_business_id, divisionId);
  const { error } = await searchParams;
  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <p><Link href="/accounting/purchase-orders">← Purchase orders</Link></p>
      <h1>New purchase order</h1>
      <p style={{ color: "#64748b" }}>Write down what you are ordering and the price agreed. No money moves until the goods arrive and the bill is posted.</p>
      {error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{error.slice(0, 300)}</p>}
      <PurchaseOrderForm choices={choices} today={todayInIndia()} />
    </main>
  );
}
export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
