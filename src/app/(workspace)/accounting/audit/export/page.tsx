import { Suspense } from "react";

import { requireAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
const btn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "12px 20px" };
const isDate = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

async function ExportContent({ searchParams }: Props) {
  const user = await requireAccess("audit_view");
  const query = await searchParams;
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const [years] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on FROM acct_financial_years
     WHERE legal_business_id = ? AND starts_on <= ? AND ends_on >= ? LIMIT 1`,
    [user.legal_business_id, today, today]
  );
  const from = isDate(query.from) ? query.from : String(years[0]?.starts_on ?? `${today.slice(0, 4)}-04-01`);
  const to = isDate(query.to) ? query.to : today;

  return (
    <main style={{ padding: 24, maxWidth: 760 }}>
      <h1>Download for the auditor</h1>
      <p style={{ color: "#64748b" }}>
        Pick the dates, then download. Only entries already posted to the ledger are included, so post any pending entries on Reports first.
      </p>
      <form method="get" action="/api/audit/export" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label>From<br /><input type="date" name="from" defaultValue={from} style={field} /></label>
          <label>To<br /><input type="date" name="to" defaultValue={to} style={field} /></label>
        </div>

        <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h2>Excel</h2>
          <p style={{ color: "#64748b" }}>Every entry line by line (day book), the trial balance, and the list of accounts.</p>
          <button type="submit" name="format" value="xlsx" className="btn-link btn-link-primary" style={btn}>Download Excel</button>
        </section>

        <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h2>Tally</h2>
          <p style={{ color: "#64748b" }}>
            Two files. In Tally, import <strong>1 Ledgers</strong> first, then <strong>2 Vouchers</strong> (Gateway of Tally, Import, Data).
            Entries are filed under Tally voucher names: Sales, Receipt, Payment, Purchase, Credit Note, Debit Note and Journal.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" name="format" value="tally-ledgers" className="btn-link" style={btn}>1 Ledgers (Tally)</button>
            <button type="submit" name="format" value="tally-vouchers" className="btn-link btn-link-primary" style={btn}>2 Vouchers (Tally)</button>
          </div>
        </section>
      </form>
    </main>
  );
}

export default function ExportPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ExportContent {...props} />
    </Suspense>
  );
}
