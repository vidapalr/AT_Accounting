import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { prettyPhone } from "@/lib/customer-phone";
import { HELP_TEXT } from "@/lib/stock-message";
import {
  addReporterAction,
  approveDraftAction,
  pasteMessageAction,
  rejectDraftAction,
  toggleReporterAction,
} from "@/lib/stock-report-actions";

type Props = { searchParams: Promise<{ result?: string; error?: string; note?: string; n?: string; p?: string }> };

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 18 };
const cell: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const btn: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: 0, background: "#1d4ed8", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 15 };
const btnGrey: React.CSSProperties = { ...btn, background: "#e2e8f0", color: "#0f172a" };
const input: React.CSSProperties = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 15, width: "100%", boxSizing: "border-box" };

const ACTION_WORDS: Record<string, string> = {
  RECEIVED: "Received", DAMAGED: "Damaged", LOST: "Lost", COUNT: "Counted", SOLD: "Sold",
};

async function Content({ searchParams }: Props) {
  const user = await requireAccess("stock");
  const { result, error, note, n, p } = await searchParams;
  const businessId = user.legal_business_id;

  const [pending] = await db.execute<RowDataPacket[]>(
    `SELECT d.id, d.action, d.quantity, d.price, d.note, d.problem, d.raw_line, d.reporter_name, d.source,
            DATE_FORMAT(d.created_at, '%d %b %H:%i') AS at, v.sku, l.location_name AS location_name
       FROM acct_stock_drafts d
       LEFT JOIN acct_product_variants v ON v.id = d.variant_id
       LEFT JOIN acct_inventory_locations l ON l.id = d.location_id
      WHERE d.legal_business_id = ? AND d.status = 'PENDING'
      ORDER BY d.id DESC LIMIT 100`,
    [businessId]
  );
  const [recent] = await db.execute<RowDataPacket[]>(
    `SELECT d.id, d.action, d.quantity, d.status, d.result_note, d.reporter_name, v.sku,
            DATE_FORMAT(d.decided_at, '%d %b %H:%i') AS at
       FROM acct_stock_drafts d LEFT JOIN acct_product_variants v ON v.id = d.variant_id
      WHERE d.legal_business_id = ? AND d.status <> 'PENDING'
      ORDER BY d.decided_at DESC LIMIT 15`,
    [businessId]
  );
  const [staff] = await db.execute<RowDataPacket[]>(
    `SELECT r.id, r.full_name, r.phone, r.status, l.location_name AS location_name
       FROM acct_stock_reporters r LEFT JOIN acct_inventory_locations l ON l.id = r.location_id
      WHERE r.legal_business_id = ? ORDER BY r.full_name`,
    [businessId]
  );
  const [locations] = await db.execute<RowDataPacket[]>(
    `SELECT id, location_name AS name FROM acct_inventory_locations WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY name`,
    [businessId]
  );

  const messages: Record<string, string> = {
    invalid: "Please fill the name, a 10 digit mobile number and the place.",
    duplicate: "This mobile number is already in the list.",
    "unknown-staff": "That number is not in the staff list below. Add the person first.",
    "reporter-added": "Staff member added.",
    "reporter-updated": "Updated.",
    rejected: "Report rejected.",
    approved: `Approved. ${note ?? ""}`,
    pasted: `Saved ${n ?? 0} line(s) for approval${Number(p) > 0 ? `, ${p} with a problem` : ""}.`,
  };

  return (
    <div style={{ maxWidth: 980 }}>
      <h1>Staff stock reports</h1>
      <p style={{ color: "#475569" }}>Staff send a short WhatsApp message. You check it here and approve. Nothing changes in stock until you approve.</p>

      {error && <p style={{ background: "#fee2e2", padding: 12, borderRadius: 8 }}>{error}</p>}
      {result && messages[result] && <p style={{ background: "#dcfce7", padding: 12, borderRadius: 8 }}>{messages[result]}</p>}

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Waiting for your approval ({pending.length})</h2>
        {pending.filter((d) => d.action === "RECEIVED" && !d.problem).length > 1 && (
          <p>
            <Link
              href={`/accounting/purchases?from_reports=${pending
                .filter((d) => d.action === "RECEIVED" && !d.problem)
                .map((d) => d.id)
                .join(",")}#purchase-entry`}
              style={btn}
            >
              Make one purchase from all received lines
            </Link>
          </p>
        )}
        {pending.length === 0 ? <p>Nothing waiting.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {pending.map((d) => (
                  <tr key={d.id}>
                    <td style={cell}>
                      <strong>{ACTION_WORDS[d.action] ?? "?"}{d.quantity ? ` ${Number(d.quantity)}` : ""}</strong>{" "}
                      {d.sku ?? ""}
                      <div style={{ color: "#64748b", fontSize: 13 }}>{d.reporter_name} · {d.location_name} · {d.at} · {d.source === "WHATSAPP" ? "WhatsApp" : "pasted"}</div>
                      {d.note && <div style={{ fontSize: 13 }}>Note: {d.note}</div>}
                      {d.problem && <div style={{ color: "#b91c1c", fontSize: 14 }}>⚠ {d.problem} (“{d.raw_line}”)</div>}
                    </td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>
                      {!d.problem && d.action !== "RECEIVED" && (
                        <form action={approveDraftAction} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={d.id} />
                          <button style={btn}>Approve</button>
                        </form>
                      )}{" "}
                      <form action={rejectDraftAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={d.id} />
                        <button style={btnGrey}>Reject</button>
                      </form>
                      {!d.problem && d.action === "RECEIVED" && <><Link href={`/accounting/purchases?from_reports=${d.id}#purchase-entry`} style={btnGrey}>Make purchase</Link></>}
                      {!d.problem && d.action === "SOLD" && <> <Link href="/accounting/sales" style={btnGrey}>Make bill</Link></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Paste a message</h2>
        <p style={{ color: "#475569" }}>If a message did not arrive automatically, copy it from WhatsApp and paste it here.</p>
        <form action={pasteMessageAction} style={{ display: "grid", gap: 10 }}>
          <label>Sender’s mobile number<input name="phone" inputMode="numeric" style={input} required /></label>
          <label>Message<textarea name="message" rows={4} style={input} required placeholder={"DAMAGED ATX-SKU-00001 2 torn\nCOUNT ATX-SKU-00002 14"} /></label>
          <div><button style={btn}>Save for approval</button></div>
        </form>
        <details style={{ marginTop: 10 }}><summary>How should staff write?</summary><pre style={{ whiteSpace: "pre-wrap" }}>{HELP_TEXT}</pre></details>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Staff who can report</h2>
        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 12 }}>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td style={cell}>{s.full_name}</td>
                <td style={cell}>{prettyPhone(s.phone)}</td>
                <td style={cell}>{s.location_name}</td>
                <td style={cell}>
                  <form action={toggleReporterAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button style={btnGrey}>{s.status === "ACTIVE" ? "Pause" : "Allow again"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td style={cell}>No staff added yet.</td></tr>}
          </tbody>
        </table>
        <form action={addReporterAction} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <label>Name<input name="full_name" style={input} required /></label>
          <label>Mobile number (10 digits)<input name="phone" inputMode="numeric" style={input} required /></label>
          <label>Works at
            <select name="location_id" style={input} required>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <div><button style={btn}>Add staff</button></div>
        </form>
      </section>

      {recent.length > 0 && (
        <section style={card}>
          <h2 style={{ marginTop: 0 }}>Recently handled</h2>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td style={cell}>{ACTION_WORDS[r.action]} {r.quantity ? Number(r.quantity) : ""} {r.sku}</td>
                  <td style={cell}>{r.reporter_name}</td>
                  <td style={cell}>{r.status === "REJECTED" ? "Rejected" : "Approved"} {r.at}{r.result_note ? ` — ${r.result_note}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>One-time set-up for automatic WhatsApp</h2>
        <ol>
          <li>In Meta’s WhatsApp settings, set the webhook address to <code>https://accounting.abhiraminc.com/api/whatsapp/webhook</code> and subscribe to “messages”.</li>
          <li>Type the same secret word in Meta and in the server setting <code>WHATSAPP_VERIFY_TOKEN</code>.</li>
          <li>Put Meta’s app secret in the server setting <code>WHATSAPP_APP_SECRET</code>.</li>
        </ol>
        <p style={{ color: "#475569" }}>Until this is done, use “Paste a message” above.</p>
      </section>
    </div>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
