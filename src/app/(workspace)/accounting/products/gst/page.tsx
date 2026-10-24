import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { saveProductGstAction } from "@/lib/gst-actions";

type Props = { searchParams: Promise<{ result?: string }> };

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Saved." },
  invalid: { ok: false, text: "An HSN code must be 4 to 8 digits and a rate must be a number from 0 to 100. Nothing was saved." },
  failed: { ok: false, text: "Could not save. Nothing was changed." },
};

async function Page({ searchParams }: Props) {
  const user = await requireAccess("products");
  const { result } = await searchParams;
  const msg = result ? MESSAGES[result] : undefined;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, product_code, product_name, hsn_code, gst_rate FROM acct_products
      WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY product_name LIMIT 500`,
    [user.legal_business_id]
  );
  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };

  return (
    <div style={{ maxWidth: 860 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/gst-settings">← GST settings</Link></nav>
      <h1>Product HSN codes and GST rates</h1>
      <p style={{ color: "#475569" }}>
        Fill these once and the app will not need to change when you register for GST. Nothing shows on invoices yet.
        Ask your CA for the right HSN code (4 digits or more) and rate for each product. Leave a box empty if you do not know yet.
      </p>
      {msg && <p role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "#166534" : "#b91c1c" }}>{msg.text}</p>}
      <form action={saveProductGstAction}>
        <datalist id="rates">{[0, 5, 12, 18, 28, 40].map(r => <option key={r} value={r} />)}</datalist>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={cell}>Product</th><th style={cell}>HSN code</th><th style={cell}>GST rate %</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={cell}><strong>{String(r.product_name)}</strong><div style={{ color: "#64748b", fontSize: 13 }}>{String(r.product_code)}</div></td>
                  <td style={cell}><input name={`hsn_${r.id}`} defaultValue={r.hsn_code ?? ""} inputMode="numeric" maxLength={8} style={{ padding: 8, width: 110, border: "1px solid #cbd5e1", borderRadius: 6 }} /></td>
                  <td style={cell}><input name={`rate_${r.id}`} defaultValue={r.gst_rate === null ? "" : String(Number(r.gst_rate))} list="rates" inputMode="decimal" style={{ padding: 8, width: 90, border: "1px solid #cbd5e1", borderRadius: 6 }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>Save all</button></p>
      </form>
    </div>
  );
}

export default function ProductGstPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Page {...props} /></Suspense>;
}
