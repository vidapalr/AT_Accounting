import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

type Props = { searchParams: Promise<{ from?: string; to?: string; what?: string; who?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const field: React.CSSProperties = { padding: "8px 10px", fontSize: 15, minWidth: 0 };
const isDate = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const words = (code: string) => code.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
const LIMIT = 300;

/** The saved details as short "name: value" text, never raw JSON. */
function detailText(json: string | null): string {
  if (!json) return "";
  try {
    const v = JSON.parse(json);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== null && typeof x !== "object")
        .map(([k, x]) => `${k.replaceAll("_", " ")}: ${String(x)}`)
        .join(" · ")
        .slice(0, 300);
    }
    return String(v).slice(0, 300);
  } catch {
    return "";
  }
}

async function ChangesContent({ searchParams }: Props) {
  const user = await requireAccess("audit_view");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const from = isDate(query.from) ? query.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = isDate(query.to) ? query.to : today;
  const what = /^[A-Z_]{1,80}$/.test(query.what ?? "") ? String(query.what) : "";
  const who = Number.isInteger(Number(query.who)) && Number(query.who) > 0 ? Number(query.who) : 0;

  const [actions] = await db.execute<Row[]>(
    `SELECT DISTINCT action FROM acct_audit_events WHERE legal_business_id = ? ORDER BY action`,
    [businessId]
  );
  const [people] = await db.execute<Row[]>(
    `SELECT DISTINCT u.id, u.full_name FROM acct_audit_events e
       JOIN acct_app_users u ON u.id = e.actor_user_id WHERE e.legal_business_id = ? ORDER BY u.full_name`,
    [businessId]
  );

  const where = ["e.legal_business_id = ?", "DATE(CONVERT_TZ(e.occurred_at, '+00:00', '+05:30')) BETWEEN ? AND ?"];
  const params: (string | number)[] = [businessId, from, to];
  if (what) { where.push("e.action = ?"); params.push(what); }
  if (who) { where.push("e.actor_user_id = ?"); params.push(who); }

  const [events] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(CONVERT_TZ(e.occurred_at, '+00:00', '+05:30'), '%d %b %Y %H:%i') AS t,
            e.action, e.subject_type, e.subject_id, e.details_json, u.full_name AS who
       FROM acct_audit_events e LEFT JOIN acct_app_users u ON u.id = e.actor_user_id
      WHERE ${where.join(" AND ")}
      ORDER BY e.id DESC LIMIT ${LIMIT}`,
    params
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Change history</h1>
      <p style={{ color: "#64748b" }}>Who did what, and when. Newest first. This page only shows; nothing here can be changed.</p>
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", margin: "12px 0" }}>
        <label>From<br /><input type="date" name="from" defaultValue={from} style={field} /></label>
        <label>To<br /><input type="date" name="to" defaultValue={to} style={field} /></label>
        <label>What happened<br />
          <select name="what" defaultValue={what} style={{ ...field, maxWidth: 260 }}>
            <option value="">Anything</option>
            {actions.map((a) => <option key={String(a.action)} value={String(a.action)}>{words(String(a.action))}</option>)}
          </select>
        </label>
        <label>Who<br />
          <select name="who" defaultValue={who ? String(who) : ""} style={field}>
            <option value="">Anyone</option>
            {people.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.full_name}</option>)}
          </select>
        </label>
        <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 15, padding: "9px 18px" }}>Show</button>
      </form>
      <p>{events.length === LIMIT ? `Showing the latest ${LIMIT}; narrow the dates to see others.` : `${events.length} event${events.length === 1 ? "" : "s"}.`}</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead><tr><th style={cell}>When</th><th style={cell}>Who</th><th style={cell}>What happened</th><th style={cell}>About</th><th style={cell}>Details</th></tr></thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>{e.t}</td>
                <td style={cell}>{e.who ?? "System"}</td>
                <td style={cell}>{words(String(e.action))}</td>
                <td style={cell}>{words(String(e.subject_type))} #{e.subject_id}</td>
                <td style={cell}>{detailText(e.details_json as string | null)}</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td style={cell} colSpan={5}>Nothing recorded for these choices.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function ChangesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ChangesContent {...props} />
    </Suspense>
  );
}
