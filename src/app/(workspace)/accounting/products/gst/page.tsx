import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { applyGarmentRuleAction, saveProductGstAction } from "@/lib/gst-actions";
import { Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { cell, field, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ result?: string }> };

const MESSAGES = {
  saved: { tone: "ok" as const, text: "Saved." },
  garments: { tone: "ok" as const, text: "Garment rule filled in for every product with an HSN code starting 61, 62 or 63." },
  invalid: { tone: "error" as const, text: "An HSN code is 4 to 8 digits, a rate is a number from 0 to 100, and a price rule needs both the higher rate and the price. Nothing was saved." },
  failed: { tone: "error" as const, text: "Could not save. Nothing was changed." },
  "needs-090": { tone: "error" as const, text: "Run migration 090 in phpMyAdmin first." },
};

async function Page({ searchParams }: Props) {
  const user = await requireAccess("products");
  const { result } = await searchParams;
  let rows: RowDataPacket[];
  let ruleReady = true;
  try {
    [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, product_code, product_name, hsn_code, gst_rate, gst_rate_high, gst_price_limit FROM acct_products
        WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY product_name LIMIT 500`,
      [user.legal_business_id]
    );
  } catch {
    ruleReady = false;
    [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, product_code, product_name, hsn_code, gst_rate, NULL AS gst_rate_high, NULL AS gst_price_limit FROM acct_products
        WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY product_name LIMIT 500`,
      [user.legal_business_id]
    );
  }
  const num = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
  const box = { ...field, width: 96, border: "1px solid #cbd5e1", borderRadius: 6 };

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader
        title="Product HSN codes and GST rates"
        back={{ href: "/accounting/gst-settings", label: "GST settings" }}
        intro="The rate each product is billed at. Ask your accountant for the right HSN code (4 digits or more). Leave a box empty if you do not know yet; bills then show 0% for it and the GST page lists it."
      />
      <ResultNotice result={result} messages={MESSAGES} />
      {!ruleReady ? <Notice tone="info">Run migration 090 to use the price rule (higher rate above a price per piece).</Notice> : null}

      <Section title="Garments and made-ups">
        <p style={muted}>
          Clothes and made-up textiles are 5% when the price before GST is up to ₹2,500 a piece and 18% above (from 22 September 2025).
          Fill in the HSN codes first, then press the button: every product whose HSN starts with 61, 62 or 63 gets this rule.
        </p>
        <form action={applyGarmentRuleAction}>
          <SubmitButton label="Apply the garment rule" className="btn-link" question="Set 5% up to Rs 2,500 and 18% above on all products with HSN 61, 62 or 63?" />
        </form>
      </Section>

      <form action={saveProductGstAction}>
        <datalist id="rates">{[0, 5, 18, 40].map((r) => <option key={r} value={r} />)}</datalist>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={cell}>Product</th>
                <th style={cell}>HSN code</th>
                <th style={cell}>GST rate %</th>
                <th style={cell}>Higher rate %</th>
                <th style={cell}>Above ₹ per piece</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={cell}><strong>{String(r.product_name)}</strong><div style={muted}>{String(r.product_code)}</div></td>
                  <td style={cell}><input name={`hsn_${r.id}`} defaultValue={r.hsn_code ?? ""} inputMode="numeric" maxLength={8} style={{ ...box, width: 110 }} aria-label="HSN code" /></td>
                  <td style={cell}><input name={`rate_${r.id}`} defaultValue={num(r.gst_rate)} list="rates" inputMode="decimal" style={box} aria-label="GST rate" /></td>
                  <td style={cell}><input name={`high_${r.id}`} defaultValue={num(r.gst_rate_high)} list="rates" inputMode="decimal" style={box} disabled={!ruleReady} aria-label="Higher rate" /></td>
                  <td style={cell}><input name={`limit_${r.id}`} defaultValue={num(r.gst_price_limit)} inputMode="decimal" style={{ ...box, width: 110 }} disabled={!ruleReady} aria-label="Price per piece" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p><SubmitButton label="Save all" /></p>
      </form>
    </main>
  );
}

export default function ProductGstPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Page {...props} /></Suspense>;
}
