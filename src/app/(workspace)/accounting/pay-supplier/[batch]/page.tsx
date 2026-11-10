import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { verifySupplierBatchAction } from "@/lib/supplier-pay-actions";
import SubmitButton from "@/components/SubmitButton";

type Props = { params: Promise<{ batch: string }>; searchParams: Promise<{ result?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const paise = (v: unknown): bigint => {
  const [w, f = ""] = String(v ?? "0").split(".");
  return BigInt(w || "0") * 100n + BigInt(f.padEnd(2, "0").slice(0, 2));
};
const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const SOURCE: Record<string, string> = {
  BUSINESS_BANK: "Business bank", BUSINESS_CASH: "Business cash", INVESTOR_BANK: "Investor bank",
  INVESTOR_CASH: "Investor cash", OWNER_PERSONAL: "Owner's own money",
};

function resultText(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "created") return "Saved. It is waiting for the owner to confirm.";
  if (code === "verified") return "Confirmed. Every bill below now shows its part as paid.";
  if (code === "invalid") return "Nothing was confirmed.";
  if (code.startsWith("partly-")) return "Some parts could not be confirmed. Open that bill's payments page to see why.";
  return null;
}

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("purchases");
  const { batch } = await params;
  const query = await searchParams;
  if (!/^ATX-BATCH-[0-9A-F]{12}$/.test(batch)) notFound();

  const [rows] = await db.execute<Row[]>(
    `SELECT p.id, p.payment_no, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, CAST(p.amount AS CHAR) AS amount,
            p.payment_method, p.payment_source, p.payment_reference, p.status, h.purchase_no, h.id AS purchase_id,
            s.supplier_name, s.id AS supplier_id
       FROM acct_purchase_payments p
       JOIN acct_purchase_headers h ON h.id = p.purchase_id AND h.legal_business_id = p.legal_business_id
       JOIN acct_suppliers s ON s.id = h.supplier_id AND s.legal_business_id = h.legal_business_id
      WHERE p.legal_business_id = ? AND p.batch_no = ? ORDER BY p.id`,
    [user.legal_business_id, batch]
  );
  if (rows.length === 0) notFound();

  const total = rows.reduce((t, r) => t + paise(r.amount), 0n);
  const drafts = rows.filter((r) => r.status === "DRAFT").length;
  const first = rows[0];
  const message = resultText(query.result);

  return (
    <main style={{ padding: 16, maxWidth: 800 }}>
      <h1>Payment to {first.supplier_name}</h1>
      {message && <p role="status" style={{ fontSize: 17, color: "#166534" }}>{message}</p>}
      <p style={{ fontSize: 18 }}>
        <strong>{rupees(total)}</strong> on {first.d} · {SOURCE[String(first.payment_source)] ?? first.payment_source}
        {first.payment_reference ? <> · Ref {first.payment_reference}</> : null}
      </p>
      <p style={{ color: "#64748b" }}>This is one payment of {rupees(total)}. Your bank statement should show it as one line.</p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={cell}>Bill</th><th style={{ ...cell, textAlign: "right" }}>Part paid</th><th style={cell}>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td style={cell}><Link href={`/accounting/purchases/${r.purchase_id}/payments`}>{r.purchase_no}</Link></td>
              <td style={{ ...cell, textAlign: "right" }}>{rupees(paise(r.amount))}</td>
              <td style={cell}>{r.status === "VERIFIED" ? "Confirmed" : r.status === "DRAFT" ? "Waiting to be confirmed" : String(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
        {drafts > 0 && user.role === "GROUP_OWNER" && (
          <form action={verifySupplierBatchAction}>
            <input type="hidden" name="batch_no" value={batch} />
            <input type="hidden" name="confirm" value="VERIFY_BATCH" />
            <SubmitButton label={`Confirm this payment (${drafts} bill${drafts === 1 ? "" : "s"})`} />
          </form>
        )}
        <Link className="btn-link" href={`/accounting/supplier-statement?supplier=${first.supplier_id}`}>Supplier statement</Link>
        <Link className="btn-link" href="/accounting/pay-supplier">Pay another supplier</Link>
      </div>
    </main>
  );
}

export default function BatchPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
