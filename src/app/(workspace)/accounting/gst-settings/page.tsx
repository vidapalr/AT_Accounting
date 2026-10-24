import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { GST_STATES } from "@/lib/gst";
import { saveGstSettingsAction } from "@/lib/gst-actions";

type Props = { searchParams: Promise<{ result?: string }> };

async function Settings({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const { result } = await searchParams;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings
      WHERE legal_business_id = ? AND setting_key LIKE 'gst\\_%'`,
    [user.legal_business_id]
  );
  const s = Object.fromEntries(rows.map(r => [String(r.setting_key), String(r.setting_value)]));
  const status = s.gst_status ?? "NOT_REGISTERED";

  const [counts] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, SUM(hsn_code IS NOT NULL AND gst_rate IS NOT NULL) AS ready
       FROM acct_products WHERE legal_business_id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id]
  );

  const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 16 };
  const input: React.CSSProperties = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>GST settings</h1>
      {result === "saved" && <p role="status" style={{ color: "#166534" }}>Saved.</p>}
      {result === "invalid" && (
        <p role="alert" style={{ color: "#b91c1c" }}>Please check the details. A registered business needs a valid GSTIN, its matching state and a start date.</p>
      )}

      <section style={box}>
        <strong>{status === "NOT_REGISTERED" ? "Not registered for GST." : "GST details saved."}</strong>
        <p style={{ color: "#475569", marginBottom: 0 }}>
          GST is <strong>off</strong>. Invoices and bills show no tax, exactly as today. The app already stores the
          tax details it will need (product codes and rates, tax columns on every invoice and purchase line), so when
          you register, the switch-on does not need a new design. A business that is not registered must not charge GST on its bills.
        </p>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Product tax details</h2>
        <p style={{ margin: "4px 0" }}>
          {Number(counts[0].ready ?? 0)} of {Number(counts[0].total)} active products have an HSN code and a tax rate.
        </p>
        <Link className="btn-link btn-link-primary" href="/accounting/products/gst">Fill product HSN codes and rates</Link>
      </section>

      <form action={saveGstSettingsAction} style={{ ...box, display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Registration</h2>
        <label>Registration type
          <select name="status" defaultValue={status} style={input}>
            <option value="NOT_REGISTERED">Not registered yet</option>
            <option value="REGULAR">Regular GST</option>
            <option value="COMPOSITION">Composition scheme</option>
          </select>
        </label>
        <label>GSTIN (when registered)
          <input name="gstin" defaultValue={s.gst_gstin ?? ""} maxLength={15} placeholder="36ABCDE1234F1Z5" style={input} />
        </label>
        <label>State of registration
          <select name="state_code" defaultValue={s.gst_state_code ?? ""} style={input}>
            <option value="">Choose a state</option>
            {GST_STATES.map(st => <option key={st.code} value={st.code}>{st.name} ({st.code})</option>)}
          </select>
        </label>
        <label>Do your selling prices already include GST?
          <select name="inclusive" defaultValue={s.gst_prices_inclusive ?? "1"} style={input}>
            <option value="1">Yes, the price on the tag is the final price (recommended for shops)</option>
            <option value="0">No, GST is added on top</option>
          </select>
        </label>
        <label>GST start date (when registered)
          <input type="date" name="effective_date" defaultValue={s.gst_effective_date ?? ""} style={input} />
        </label>
        <div><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer" }}>Save</button></div>
      </form>
    </div>
  );
}

export default function GstSettingsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Settings {...props} /></Suspense>;
}
