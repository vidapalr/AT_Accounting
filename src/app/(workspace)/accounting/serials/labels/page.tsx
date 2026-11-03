import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";

type Props = { searchParams: Promise<{ variant?: string }> };

export default function LabelsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const v = Number((await searchParams).variant);
  if (!Number.isSafeInteger(v) || v <= 0) notFound();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT s.serial_no, p.product_name, v.sku, v.size_label, v.color_name
       FROM acct_serials s JOIN acct_product_variants v ON v.id = s.variant_id JOIN acct_products p ON p.id = v.product_id
      WHERE s.legal_business_id = ? AND s.variant_id = ? AND s.status = 'IN_STOCK' ORDER BY s.id LIMIT 300`, [user.legal_business_id, v]);
  return (
    <main style={{ padding: 16 }}>
      <div className="no-print" style={{ marginBottom: 12 }}>
        <h1>Piece labels</h1>
        <p>{rows.length} pieces in stock. Print, cut along the boxes and stick one on each piece.</p>
        <PrintButton label="Print labels" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
        {rows.map(r => (
          <div key={String(r.serial_no)} style={{ border: "1px dashed #64748b", padding: 8, textAlign: "center", breakInside: "avoid" }}>
            <div style={{ fontSize: 11 }}>ABHIRAM TEXTILES</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1 }}>{String(r.serial_no)}</div>
            <div style={{ fontSize: 11 }}>{String(r.product_name)}{r.color_name ? ` · ${String(r.color_name)}` : ""}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
