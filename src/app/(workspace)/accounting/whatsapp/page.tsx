import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  addRecipientAction,
  addSubscriptionAction,
  removeRecipientAction,
  removeSubscriptionAction,
  retryFailedAction,
  sendNowAction,
  setRecipientStatusAction,
  setSubscriptionStatusAction,
} from "@/lib/whatsapp-actions";
import { REPORT_LABELS, REPORT_TYPES, TEMPLATES, type ReportType } from "@/lib/whatsapp/core";
import { getProvider } from "@/lib/whatsapp/provider";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ done?: string; error?: string }> };

export default function WhatsAppPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading WhatsApp reports…</p>}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ searchParams }: Props) {
  const owner = await requireGroupOwner();
  const businessId = owner.legal_business_id;
  const query = await searchParams;
  const provider = getProvider();

  const [recipients] = await db.execute<RowDataPacket[]>(
    `SELECT r.id, r.full_name, r.phone_e164, r.status, r.investor_party_id, p.full_name AS investor_name
     FROM acct_whatsapp_recipients r LEFT JOIN acct_funding_parties p ON p.id = r.investor_party_id
     WHERE r.legal_business_id = ? ORDER BY r.full_name`,
    [businessId]
  );
  const [subs] = await db.execute<RowDataPacket[]>(
    `SELECT s.id, s.recipient_id, s.report_type, s.division_id, s.branch_id, s.status
     FROM acct_whatsapp_subscriptions s WHERE s.legal_business_id = ? ORDER BY s.id`,
    [businessId]
  );
  const [divisions] = await db.execute<RowDataPacket[]>(`SELECT id, name FROM acct_divisions WHERE legal_business_id = ? ORDER BY name`, [businessId]);
  const [branches] = await db.execute<RowDataPacket[]>(`SELECT id, division_id, branch_name FROM acct_branches WHERE legal_business_id = ? ORDER BY branch_name`, [businessId]);
  const [parties] = await db.execute<RowDataPacket[]>(`SELECT id, full_name FROM acct_funding_parties WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY full_name`, [businessId]);
  const [log] = await db.execute<RowDataPacket[]>(
    `SELECT o.id, o.report_type, o.period_key, o.status, o.attempts, o.error_text,
            DATE_FORMAT(CONVERT_TZ(o.sent_at, '+00:00', '+05:30'), '%d %b %H:%i') AS sent_at,
            DATE_FORMAT(CONVERT_TZ(o.created_at, '+00:00', '+05:30'), '%d %b %H:%i') AS created, r.full_name
     FROM acct_whatsapp_outbox o JOIN acct_whatsapp_recipients r ON r.id = o.recipient_id
     WHERE o.legal_business_id = ? ORDER BY o.id DESC LIMIT 40`,
    [businessId]
  );

  const divisionName = new Map(divisions.map((d) => [Number(d.id), String(d.name)]));
  const branchName = new Map(branches.map((b) => [Number(b.id), String(b.branch_name)]));
  const place = (s: RowDataPacket) =>
    s.branch_id !== null ? `Branch: ${branchName.get(Number(s.branch_id)) ?? s.branch_id}` : s.division_id !== null ? `Division: ${divisionName.get(Number(s.division_id)) ?? s.division_id}` : "Whole group";

  const hasFailed = log.some((l) => l.status === "FAILED");

  return (
    <main className={styles.page}>
      <h1>WhatsApp Reports</h1>
      <p>
        Choose who receives which report and for which place. Reports go out automatically: daily reports at 9 PM, stock and dues
        alerts at 8 AM, and monthly statements and stock on the 1st.
      </p>

      {query.done && <p role="status" style={{ color: "#166534" }}>{query.done}</p>}
      {query.error && <p role="alert" style={{ color: "#b91c1c" }}>{query.error}</p>}

      <section style={{ background: provider.configured ? "#f0fdf4" : "#fffbeb", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, margin: "12px 0" }}>
        <strong>{provider.configured ? "WhatsApp is connected." : "WhatsApp is not connected yet."}</strong>
        {!provider.configured && (
          <p style={{ margin: "6px 0 0" }}>
            You can already add people and use <em>Preview</em> to see each report. Messages will start flowing once the
            WhatsApp Business details are added to the server (see &quot;Setting up the connection&quot; below).
          </p>
        )}
      </section>

      <h2>People and their reports</h2>
      {recipients.length === 0 && <p>Nobody added yet. Add the first person below.</p>}
      {recipients.map((r) => {
        const mine = subs.filter((s) => Number(s.recipient_id) === Number(r.id));
        const paused = String(r.status) === "PAUSED";
        return (
          <section key={String(r.id)} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, margin: "12px 0", opacity: paused ? 0.65 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{String(r.full_name)}</strong> · {String(r.phone_e164)}
                {r.investor_name ? ` · investor: ${String(r.investor_name)}` : ""}
                {paused ? " · PAUSED" : ""}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <form action={setRecipientStatusAction}>
                  <input type="hidden" name="recipient_id" value={String(r.id)} />
                  <input type="hidden" name="status" value={paused ? "ACTIVE" : "PAUSED"} />
                  <button type="submit">{paused ? "Resume" : "Pause all"}</button>
                </form>
                <form action={removeRecipientAction}>
                  <input type="hidden" name="recipient_id" value={String(r.id)} />
                  <button type="submit">Remove person</button>
                </form>
              </div>
            </div>

            {mine.length > 0 && (
              <table style={{ marginTop: 10 }}>
                <thead><tr><th>Report</th><th>For</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {mine.map((s) => {
                    const subPaused = String(s.status) === "PAUSED";
                    return (
                      <tr key={String(s.id)}>
                        <td>{REPORT_LABELS[String(s.report_type) as ReportType]}</td>
                        <td>{String(s.report_type) === "INVESTOR_STATEMENT" ? "Their own agreements" : place(s)}</td>
                        <td>{subPaused ? "Paused" : "Active"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <a href={`/api/whatsapp/preview?subscription=${s.id}`} target="_blank" rel="noreferrer">Preview PDF</a>
                            <form action={sendNowAction}>
                              <input type="hidden" name="subscription_id" value={String(s.id)} />
                              <button type="submit">Send now</button>
                            </form>
                            <form action={setSubscriptionStatusAction}>
                              <input type="hidden" name="subscription_id" value={String(s.id)} />
                              <input type="hidden" name="status" value={subPaused ? "ACTIVE" : "PAUSED"} />
                              <button type="submit">{subPaused ? "Resume" : "Pause"}</button>
                            </form>
                            <form action={removeSubscriptionAction}>
                              <input type="hidden" name="subscription_id" value={String(s.id)} />
                              <button type="submit">Remove</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <form action={addSubscriptionAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "end" }}>
              <input type="hidden" name="recipient_id" value={String(r.id)} />
              <label>
                Add a report
                <select name="report_type" defaultValue="DAILY_SALES">
                  {REPORT_TYPES.map((t) => (
                    <option key={t} value={t}>{REPORT_LABELS[t]}</option>
                  ))}
                </select>
              </label>
              <label>
                For
                <select name="scope" defaultValue="G">
                  <option value="G">Whole group</option>
                  {divisions.map((d) => (
                    <optgroup key={String(d.id)} label={String(d.name)}>
                      <option value={`D:${d.id}`}>Division: {String(d.name)}</option>
                      {branches.filter((b) => Number(b.division_id) === Number(d.id)).map((b) => (
                        <option key={String(b.id)} value={`B:${b.id}`}>Branch: {String(b.branch_name)}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button type="submit">Add</button>
            </form>
          </section>
        );
      })}

      <h2>Add a person</h2>
      <form action={addRecipientAction} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <label>Name<input name="full_name" required maxLength={160} /></label>
        <label>WhatsApp number<input name="phone" required placeholder="98765 43210" inputMode="tel" /></label>
        <label>
          Investor (only for investors who get a monthly statement)
          <select name="investor_party_id" defaultValue="">
            <option value="">Not an investor</option>
            {parties.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>{String(p.full_name)}</option>
            ))}
          </select>
        </label>
        <button type="submit">Add person</button>
      </form>

      <h2>Message log</h2>
      {hasFailed && (
        <form action={retryFailedAction} style={{ marginBottom: 8 }}>
          <button type="submit">Retry failed messages</button>
        </form>
      )}
      {log.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <table>
          <thead><tr><th>When</th><th>To</th><th>Report</th><th>Period</th><th>Result</th></tr></thead>
          <tbody>
            {log.map((l) => (
              <tr key={String(l.id)}>
                <td>{String(l.sent_at ?? l.created)}</td>
                <td>{String(l.full_name)}</td>
                <td>{REPORT_LABELS[String(l.report_type) as ReportType] ?? String(l.report_type)}</td>
                <td>{String(l.period_key)}</td>
                <td>
                  {String(l.status) === "SENT" ? "Sent" : String(l.status) === "FAILED" ? `Failed: ${String(l.error_text ?? "")}` : String(l.status) === "SKIPPED" ? "Nothing to report" : `Waiting${l.error_text ? ` (${String(l.error_text)})` : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Setting up the connection</h2>
      <ol>
        <li>Create a WhatsApp Business account with Meta (or your chosen provider) and verify the sending number.</li>
        <li>
          Submit these message templates for approval (category Utility, language English, with a PDF document as the header). The wording
          and the numbered blanks must match exactly:
          <ul>
            {TEMPLATES.filter((t, i, a) => a.findIndex((x) => x.name === t.name) === i).map((t) => (
              <li key={t.name}><code>{t.name}</code>: {t.body}</li>
            ))}
          </ul>
        </li>
        <li>
          In the server settings (Hostinger → Node.js app → environment variables) add <code>WHATSAPP_PHONE_NUMBER_ID</code>,{" "}
          <code>WHATSAPP_ACCESS_TOKEN</code> and <code>CRON_SECRET</code> (any long random text, 16+ characters), then restart the app.
        </li>
        <li>
          In hPanel → Cron Jobs add three jobs that call the portal (use your <code>CRON_SECRET</code>; times are server time, adjust
          if the server is not on India time):
          <ul>
            <li>Every day 9 PM: <code>curl -s -H &quot;Authorization: Bearer YOUR_SECRET&quot; &quot;https://accounting.abhiraminc.com/api/whatsapp/run?job=daily&quot;</code></li>
            <li>Every day 8 AM: same address with <code>?job=morning</code></li>
            <li>1st of each month 9 AM: same address with <code>?job=monthly</code></li>
          </ul>
        </li>
      </ol>
    </main>
  );
}
