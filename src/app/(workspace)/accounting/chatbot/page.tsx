import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { botConfigured } from "@/lib/bot/send";
import {
  saveBotSettingsAction, saveAnswerAction, toggleAnswerAction, deleteAnswerAction, markChatDoneAction,
} from "@/lib/bot-actions";

type Props = { searchParams: Promise<{ result?: string; edit?: string; q?: string }> };

const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, width: "100%", fontSize: 16, boxSizing: "border-box" };
const btn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "12px 20px" };

async function Chatbot({ searchParams }: Props) {
  const user = await requireAccess("online_orders");
  const { result, edit, q } = await searchParams;
  const isOwner = user.role === "GROUP_OWNER";
  const biz = user.legal_business_id;

  const [settings] = await db.execute<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key IN ('bot_enabled','bot_owner_numbers')`, [biz]);
  const s = new Map(settings.map((r) => [String(r.setting_key), String(r.setting_value)]));
  const enabled = s.get("bot_enabled") === "1";

  const [waiting] = await db.execute<RowDataPacket[]>(
    `SELECT id, wa_number, contact_name, last_text, last_inbound_at FROM acct_bot_conversations
      WHERE legal_business_id = ? AND status = 'NEEDS_PERSON' ORDER BY last_inbound_at DESC LIMIT 50`, [biz]);
  const [answers] = await db.execute<RowDataPacket[]>(
    `SELECT id, title, keywords, reply, status FROM acct_bot_answers WHERE legal_business_id = ? ORDER BY title`, [biz]);
  const [unanswered] = await db.execute<RowDataPacket[]>(
    `SELECT body, COUNT(*) AS n FROM acct_bot_messages
      WHERE legal_business_id = ? AND direction = 'IN' AND kind = 'HANDOFF' AND created_at > NOW() - INTERVAL 30 DAY AND CHAR_LENGTH(body) > 3 AND body <> '(not text)'
      GROUP BY body ORDER BY n DESC, MAX(id) DESC LIMIT 10`, [biz]);
  const editing = edit ? answers.find((a) => String(a.id) === edit) : undefined;

  return (
    <div style={{ maxWidth: 760 }}>
      <h1>WhatsApp chatbot</h1>
      {result === "settings" && <p role="status" style={{ color: "#166534" }}>Saved.</p>}
      {result === "answer" && <p role="status" style={{ color: "#166534" }}>Answer saved. The bot will use it from now on.</p>}
      {result === "missing" && <p role="alert" style={{ color: "#b91c1c" }}>Fill in the name, the words customers use, and the reply.</p>}

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Status</h2>
        <p style={{ margin: "0 0 8px" }}>
          Connection to WhatsApp: <strong style={{ color: botConfigured() ? "#166534" : "#b91c1c" }}>{botConfigured() ? "keys found" : "keys missing on the server"}</strong>
        </p>
        <p style={{ margin: 0 }}>Bot: <strong>{enabled ? "ON, answering customers" : "OFF, not replying to anyone"}</strong></p>
        {isOwner ? (
          <form action={saveBotSettingsAction} style={{ marginTop: 12 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input type="checkbox" name="enabled" value="1" defaultChecked={enabled} style={{ width: 22, height: 22 }} /> Turn the bot on
            </label>
            <label>Your own WhatsApp number(s), to ask the bot about sales, stock and dues (one per line)
              <br /><textarea name="owner_numbers" rows={2} defaultValue={(s.get("bot_owner_numbers") ?? "").split(",").filter(Boolean).join("\n")} style={input} />
            </label>
            <button type="submit" className="btn-link btn-link-primary" style={{ ...btn, marginTop: 12 }}>Save</button>
          </form>
        ) : <p style={{ color: "#475569" }}>Only the owner can switch the bot on or off.</p>}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Needs a person ({waiting.length})</h2>
        {waiting.length === 0 ? <p style={{ margin: 0, color: "#475569" }}>Nobody is waiting.</p> : waiting.map((w) => (
          <div key={String(w.id)} style={{ borderTop: "1px solid #e2e8f0", padding: "12px 0" }}>
            <strong>{String(w.contact_name ?? "") || "+" + String(w.wa_number)}</strong> <span style={{ color: "#64748b" }}>+{String(w.wa_number)}</span>
            <p style={{ margin: "4px 0 8px", color: "#334155" }}>{String(w.last_text ?? "")}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="btn-link btn-link-primary" style={btn} href={`https://wa.me/${String(w.wa_number)}`} target="_blank" rel="noreferrer">Open in WhatsApp</a>
              <form action={markChatDoneAction}><input type="hidden" name="id" value={String(w.id)} /><button type="submit" className="btn-link" style={btn}>Mark done</button></form>
            </div>
          </div>
        ))}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>{editing ? "Change answer" : "Add an answer"}</h2>
        <form action={saveAnswerAction} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="id" value={editing ? String(editing.id) : "0"} />
          <label>Name (for you)<br /><input name="title" required maxLength={120} defaultValue={editing ? String(editing.title) : ""} style={input} placeholder="Shop timings" /></label>
          <label>Words customers use (separate with commas)<br /><input name="keywords" required maxLength={500} defaultValue={editing ? String(editing.keywords) : (q ?? "")} style={input} placeholder="timing, open, close, time" /></label>
          <label>Reply<br /><textarea name="reply" required maxLength={1500} rows={4} defaultValue={editing ? String(editing.reply) : ""} style={input} /></label>
          <div><button type="submit" className="btn-link btn-link-primary" style={btn}>Save answer</button></div>
        </form>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Quick answers ({answers.length})</h2>
        {answers.length === 0 ? <p style={{ margin: 0, color: "#475569" }}>None yet. Prices, stock and order status work without any setup. Add answers for shop timings, address, delivery, returns and so on.</p> : answers.map((a) => (
          <div key={String(a.id)} style={{ borderTop: "1px solid #e2e8f0", padding: "12px 0", opacity: a.status === "PAUSED" ? 0.6 : 1 }}>
            <strong>{String(a.title)}</strong> {a.status === "PAUSED" && <em style={{ color: "#64748b" }}>(paused)</em>}
            <p style={{ margin: "4px 0", color: "#64748b" }}>Words: {String(a.keywords)}</p>
            <p style={{ margin: "4px 0 8px", whiteSpace: "pre-wrap" }}>{String(a.reply)}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="btn-link" style={btn} href={`/accounting/chatbot?edit=${String(a.id)}`}>Change</a>
              <form action={toggleAnswerAction}><input type="hidden" name="id" value={String(a.id)} /><button type="submit" className="btn-link" style={btn}>{a.status === "ACTIVE" ? "Pause" : "Turn on"}</button></form>
              <form action={deleteAnswerAction}><input type="hidden" name="id" value={String(a.id)} /><button type="submit" className="btn-link" style={btn}>Delete</button></form>
            </div>
          </div>
        ))}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Questions the bot could not answer</h2>
        {unanswered.length === 0 ? <p style={{ margin: 0, color: "#475569" }}>None in the last 30 days.</p> : unanswered.map((u, i) => (
          <div key={i} style={{ borderTop: "1px solid #e2e8f0", padding: "10px 0", display: "flex", gap: 12, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
            <span>{String(u.body)} {Number(u.n) > 1 && <span style={{ color: "#64748b" }}>(asked {Number(u.n)} times)</span>}</span>
            <a className="btn-link" style={btn} href={`/accounting/chatbot?q=${encodeURIComponent(String(u.body).slice(0, 80))}`}>Add an answer</a>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function ChatbotPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Chatbot {...props} /></Suspense>;
}
