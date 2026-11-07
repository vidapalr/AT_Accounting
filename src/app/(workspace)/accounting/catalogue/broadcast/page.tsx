import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { botConfigured } from "@/lib/bot/send";
import { audienceFor, getSettings, loadArrival, sentToday } from "@/lib/broadcast-data";
import { eventKey, estimatePaise, roomLeft } from "@/lib/broadcast-math";
import { startBroadcastAction, sendBroadcastTestAction } from "@/lib/broadcast-actions";

type Props = { searchParams: Promise<{ events?: string; error?: string; test?: string }> };

const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 16, boxSizing: "border-box" };
const ERRORS: Record<string, string> = {
  confirm: "Tick the box to confirm the number of messages and the cost.",
  keys: "WhatsApp keys are not set on the server.",
  template: "Type the approved template name on the Chatbot page first.",
  arrival: "Choose the arrivals of one product.",
  photo: "This product needs a JPEG or PNG photo (WhatsApp does not take other kinds). Add one first.",
  shop: "Switch the product on for the online shop first, so WhatsApp can fetch its photo.",
  nobody: "There is nobody to send to: everyone who agreed has already got this arrival.",
  changed: "The list of customers changed while you were looking. Check the numbers and try again.",
};

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const q = await searchParams;
  const businessId = user.legal_business_id;
  const ids = String(q.events ?? "").split(",").map(Number).filter(n => Number.isSafeInteger(n) && n > 0);

  let ready = true;
  let settings: Record<string, string> = {};
  let history: RowDataPacket[] = [];
  try {
    settings = await getSettings(businessId);
    [history] = await db.execute<RowDataPacket[]>(
      `SELECT b.id, b.product_label, b.status, DATE_FORMAT(b.created_at, '%d %b %H:%i') AS at,
              (SELECT COUNT(*) FROM acct_wa_broadcast_recipients r WHERE r.broadcast_id = b.id) AS total,
              (SELECT COUNT(*) FROM acct_wa_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'SENT') AS sent
         FROM acct_wa_broadcasts b WHERE b.legal_business_id = ? ORDER BY b.id DESC LIMIT 10`, [businessId]);
  } catch { ready = false; }

  const arrival = ready && ids.length ? await loadArrival(businessId, ids) : null;
  const key = eventKey(ids);
  const aud = ready && arrival && !("error" in arrival) ? await audienceFor(businessId, key) : null;
  const max = Number(settings.wa_broadcast_daily_max ?? 0);
  const today = ready ? await sentToday(businessId) : 0;
  const rate = settings.wa_broadcast_rate_paise ? Number(settings.wa_broadcast_rate_paise) : null;
  const cost = aud ? estimatePaise(aud.todo.length, rate) : null;
  const room = roomLeft(max, today);

  return (
    <div style={{ maxWidth: 820 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/catalogue/new-stock">← New stock arrivals</Link></nav>
      <h1>Send new stock on WhatsApp (automatic)</h1>
      <p style={{ color: "#475569" }}>
        Sends the approved message with the product photo to every customer who ticked OK to send offers. Each message is paid for by Meta.
        Customers can reply STOP to be taken off. For a free send by hand use &ldquo;Send to customers&rdquo; on the arrivals page.
      </p>
      {!ready && <p role="alert" style={{ color: "#b91c1c" }}>This needs the database file 074_wa_broadcasts.sql to be run first.</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{ERRORS[q.error] ?? "Something went wrong."}</p>}
      {q.test && <p role="status" style={{ color: q.test.startsWith("Not") || q.test.startsWith("Type") || q.test.startsWith("Set") ? "#b91c1c" : "#166534" }}>{q.test}</p>}

      {ready && !arrival && <p>Open this from a new arrival on the New stock page.</p>}
      {arrival && "error" in arrival && <p role="alert" style={{ color: "#b91c1c" }}>{arrival.error}</p>}

      {arrival && !("error" in arrival) && aud && (
        <>
          <section style={box}>
            <h2 style={{ marginTop: 0 }}>{arrival.label}</h2>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              {arrival.imageId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/catalogue/media/${arrival.imageId}`} alt={arrival.label} style={{ width: 120, aspectRatio: "4 / 5", objectFit: "cover", borderRadius: 8 }} />
              ) : <p style={{ color: "#b91c1c" }}>No JPEG or PNG photo yet.</p>}
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li><strong>{aud.todo.length}</strong> customers will get it{aud.alreadyGot > 0 ? ` (${aud.alreadyGot} already got this arrival)` : ""}</li>
                <li>Cost: {cost === null ? "set the rate per message on the Chatbot page to see an estimate" : `about ₹${(cost / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</li>
                <li>Daily limit: {max > 0 ? `${max} messages, ${today} sent today, ${room} left` : "not set on the Chatbot page, so nothing can be sent"}</li>
                <li>Template: {settings.wa_broadcast_template ? <code>{settings.wa_broadcast_template}</code> : "not set on the Chatbot page"}</li>
                {!arrival.shopOn && <li style={{ color: "#b91c1c" }}>Product is not on the online shop: switch it on so WhatsApp can fetch the photo.</li>}
              </ul>
            </div>
          </section>

          <section style={box}>
            <h2 style={{ marginTop: 0 }}>1. Send a test to your own number</h2>
            <form action={sendBroadcastTestAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input type="hidden" name="events" value={ids.join(",")} />
              <input name="phone" inputMode="numeric" placeholder="Your 10 digit mobile" style={{ ...input, width: 220 }} />
              <button type="submit" className="btn-link" style={{ cursor: "pointer", fontSize: 16, padding: "12px 18px" }}>Send test</button>
            </form>
          </section>

          <section style={box}>
            <h2 style={{ marginTop: 0 }}>2. Send to everyone on the list</h2>
            <form action={startBroadcastAction} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="events" value={ids.join(",")} />
              <input type="hidden" name="count" value={aud.todo.length} />
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" name="confirm" value="1" style={{ width: 22, height: 22, flexShrink: 0 }} />
                <span>Send to {aud.todo.length} customers{cost !== null ? `, about ₹${(cost / 100).toFixed(2)}` : ""}. I checked the test message.</span>
              </label>
              <div><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 17, padding: "14px 22px" }} disabled={aud.todo.length === 0}>Send now</button></div>
            </form>
          </section>
        </>
      )}

      {history.length > 0 && (
        <section style={box}>
          <h2 style={{ marginTop: 0 }}>Earlier sends</h2>
          {history.map(h => (
            <div key={String(h.id)} style={{ padding: "8px 0", borderTop: "1px solid #f1f5f9" }}>
              <Link href={`/accounting/catalogue/broadcast/${h.id}`}>{String(h.product_label)}</Link>
              <span style={{ color: "#64748b" }}> · {String(h.at)} · {Number(h.sent)} of {Number(h.total)} sent{h.status === "DONE" ? "" : " (not finished)"}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
