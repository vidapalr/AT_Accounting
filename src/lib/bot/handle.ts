import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

import { db } from "@/lib/db";
import { getShopProducts } from "@/lib/shop";
import { shopBaseUrl } from "@/lib/shop-url";
import { sendWhatsAppText } from "./send";
import {
  TEXT, OWNER_HELP, classify, matchAnswer, matchProducts, productReply, orderReply, last10, ownerCommand,
  type SavedAnswer, type Intent,
} from "./engine";

type Row = RowDataPacket & Record<string, string | number | null>;

const BUSINESS_ID = Number(process.env.SHOP_BUSINESS_ID ?? 1);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() + 5.5 * 3600 * 1000 - n * 86_400_000).toISOString().slice(0, 10);

async function setting(key: string): Promise<string> {
  const [r] = await db.execute<Row[]>(`SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = ?`, [BUSINESS_ID, key]);
  return r[0] ? String(r[0].setting_value) : "";
}

export async function botEnabled(): Promise<boolean> {
  return (await setting("bot_enabled")) === "1";
}

async function ownerNumbers(): Promise<string[]> {
  return (await setting("bot_owner_numbers")).split(",").map((s) => last10(s)).filter((s) => s.length === 10);
}

// ------------------------------------------------------------ owner (read-only)

async function ownerAnswer(text: string): Promise<string> {
  const cmd = ownerCommand(text);
  if (cmd.kind === "HELP") return OWNER_HELP;

  if (cmd.kind === "SALES") {
    const d = cmd.day === "today" ? today() : daysAgo(1);
    const [r] = await db.execute<Row[]>(
      `SELECT COUNT(*) AS bills, COALESCE(SUM(grand_total), 0) AS total FROM acct_sales_headers
        WHERE legal_business_id = ? AND status = 'POSTED' AND invoice_date = ?`, [BUSINESS_ID, d]);
    const [c] = await db.execute<Row[]>(
      `SELECT COALESCE(SUM(p.amount), 0) AS t FROM acct_sales_payments p JOIN acct_sales_headers h ON h.id = p.sale_id
        WHERE p.legal_business_id = ? AND p.status = 'RECORDED' AND p.payment_method NOT IN ('DISCOUNT','SET_OFF','EXCHANGE') AND h.status = 'POSTED' AND p.payment_date = ?`, [BUSINESS_ID, d]);
    return `Sales ${cmd.day} (${d}): ${inr(Number(r[0].total))} from ${Number(r[0].bills)} bills.\nCollected: ${inr(Number(c[0].t))}.`;
  }

  if (cmd.kind === "STOCK") {
    const like = `%${cmd.query.split(" ").join("%")}%`;
    const [rows] = await db.execute<Row[]>(
      `SELECT p.product_name, v.size_label, v.color_name, SUM(m.quantity_change) AS qty
         FROM acct_stock_movements m JOIN acct_product_variants v ON v.id = m.variant_id JOIN acct_products p ON p.id = v.product_id
        WHERE m.legal_business_id = ? AND (p.product_name LIKE ? OR v.color_name LIKE ? OR p.fabric LIKE ?)
        GROUP BY m.variant_id, p.product_name, v.size_label, v.color_name HAVING qty > 0 ORDER BY qty DESC LIMIT 12`,
      [BUSINESS_ID, like, like, like]);
    if (rows.length === 0) return `Nothing in stock matches "${cmd.query}".`;
    return `Stock for "${cmd.query}":\n` + rows.map((r) => `- ${r.product_name}${r.size_label || r.color_name ? ` (${[r.size_label, r.color_name].filter(Boolean).join(", ")})` : ""}: ${Number(r.qty)}`).join("\n");
  }

  if (cmd.kind === "OWES") {
    const [rows] = await db.execute<Row[]>(
      `SELECT h.customer_name AS name,
              SUM(h.grand_total
                - COALESCE((SELECT SUM(p.amount) FROM acct_sales_payments p WHERE p.sale_id = h.id AND p.status = 'RECORDED'), 0)
                - COALESCE((SELECT SUM(r.refund_value) FROM acct_sales_returns r WHERE r.sale_id = h.id AND r.status = 'POSTED'), 0)
                + COALESCE((SELECT SUM(px.amount) FROM acct_sales_payments px JOIN acct_sales_returns r3 ON r3.id = px.exchange_return_id WHERE r3.sale_id = h.id AND px.status = 'RECORDED'), 0)
                + COALESCE((SELECT SUM(f.amount) FROM acct_sales_refunds f JOIN acct_sales_returns r2 ON r2.id = f.return_id WHERE r2.sale_id = h.id AND f.status = 'RECORDED'), 0)) AS due
         FROM acct_sales_headers h WHERE h.legal_business_id = ? AND h.status = 'POSTED'
         GROUP BY h.customer_name HAVING due > 0.004 ORDER BY due DESC LIMIT 10`, [BUSINESS_ID]);
    if (rows.length === 0) return "Nobody owes you anything right now.";
    const total = rows.reduce((s, r) => s + Number(r.due), 0);
    return `Customers who owe you (top ${rows.length}, total ${inr(total)}):\n` + rows.map((r) => `- ${r.name ?? "Walk-in"}: ${inr(Number(r.due))}`).join("\n");
  }

  const [rows] = await db.execute<Row[]>(
    `SELECT order_no, customer_name, items_total, status FROM acct_online_orders
      WHERE legal_business_id = ? AND status IN ('REQUESTED','CONFIRMED') ORDER BY created_at DESC LIMIT 10`, [BUSINESS_ID]);
  if (rows.length === 0) return "No website orders are waiting.";
  return `Website orders waiting (${rows.length}):\n` + rows.map((r) => `- ${r.order_no} ${r.customer_name}: ${inr(Number(r.items_total))} (${String(r.status).toLowerCase()})`).join("\n");
}

// ------------------------------------------------------------ customers

async function productAnswer(query: string): Promise<string | null> {
  const items = (await getShopProducts()).map((p) => ({ id: p.id, name: p.name, fabric: p.fabric, fromPrice: p.fromPrice, available: p.available }));
  const found = matchProducts(query, items);
  return found.length ? productReply(found, shopBaseUrl()) : null;
}

async function orderAnswer(orderNo: string, number: string): Promise<string | null> {
  const [rows] = await db.execute<Row[]>(
    `SELECT order_no, status, items_total, shipping_charge, phone FROM acct_online_orders WHERE legal_business_id = ? AND order_no = ?`,
    [BUSINESS_ID, orderNo]);
  const o = rows[0];
  if (!o || last10(String(o.phone)) !== last10(number)) return null; // never show someone else's order
  return orderReply({ orderNo: String(o.order_no), status: String(o.status), items: Number(o.items_total), shipping: Number(o.shipping_charge) });
}

type Reply = { text: string; kind: string };

async function decide(intent: Intent, text: string, number: string, awaiting: string, firstContact: boolean): Promise<{ replies: Reply[]; awaiting: "NONE" | "PRODUCT" | "ORDER"; handoff: boolean }> {
  const replies: Reply[] = [];
  if (firstContact) replies.push({ text: TEXT.menu, kind: "GREETING" });
  const done = (aw: "NONE" | "PRODUCT" | "ORDER" = "NONE", handoff = false) => ({ replies, awaiting: aw, handoff });

  if (intent.kind === "GREETING") {
    if (!firstContact) replies.push({ text: TEXT.menu, kind: "GREETING" });
    return done();
  }
  if (intent.kind === "MENU") {
    if (intent.n === 1) { replies.push({ text: TEXT.askProduct, kind: "ASK" }); return done("PRODUCT"); }
    if (intent.n === 2) { replies.push({ text: TEXT.askOrder, kind: "ASK" }); return done("ORDER"); }
    return done("NONE", true);
  }
  if (intent.kind === "PERSON") return done("NONE", true);

  if (intent.kind === "ORDER") {
    const a = await orderAnswer(intent.orderNo, number);
    if (a) { replies.push({ text: a, kind: "ORDER" }); return done(); }
    replies.push({ text: TEXT.noOrder, kind: "ORDER" });
    return done();
  }

  const answers = await db.execute<Row[]>(
    `SELECT id, title, keywords, reply FROM acct_bot_answers WHERE legal_business_id = ? AND status = 'ACTIVE'`, [BUSINESS_ID]
  ).then(([r]) => r.map((x) => ({ id: Number(x.id), title: String(x.title), keywords: String(x.keywords), reply: String(x.reply) })) as SavedAnswer[]);
  const saved = awaiting === "PRODUCT" ? null : matchAnswer(text, answers);
  if (saved) { replies.push({ text: saved.reply, kind: "ANSWER" }); return done(); }

  if (intent.kind === "PRODUCT") {
    const a = await productAnswer(intent.query);
    if (a) { replies.push({ text: a, kind: "PRODUCT" }); return done(); }
    replies.push({ text: TEXT.noProduct, kind: "HANDOFF" });
    return done("NONE", true);
  }
  // Something the bot cannot answer: a person will.
  return done("NONE", true);
}

export async function handleIncoming(m: { from: string; text: string | null; id: string | null; name: string | null }): Promise<void> {
  if (!(await botEnabled())) return;
  const number = m.from.replace(/\D/g, "");
  if (!number) return;

  if (m.id) {
    const [dup] = await db.execute<Row[]>(`SELECT id FROM acct_bot_messages WHERE wa_message_id = ?`, [m.id]);
    if (dup.length) return;
  }

  await db.execute(
    `INSERT INTO acct_bot_conversations (legal_business_id, wa_number, contact_name) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE contact_name = COALESCE(VALUES(contact_name), contact_name)`,
    [BUSINESS_ID, number, m.name]
  );
  const [convs] = await db.execute<Row[]>(
    `SELECT id, status, awaiting, greeted_at, human_active_until,
            (human_active_until IS NOT NULL AND human_active_until > NOW()) AS human_on,
            (greeted_at IS NULL OR greeted_at < NOW() - INTERVAL 24 HOUR) AS stale_greeting
       FROM acct_bot_conversations WHERE legal_business_id = ? AND wa_number = ?`, [BUSINESS_ID, number]);
  const conv = convs[0];
  const convId = Number(conv.id);
  const text = (m.text ?? "").trim();

  const log = async (direction: "IN" | "OUT", body: string, kind: string, waId: string | null = null) => {
    await db.execute(
      `INSERT INTO acct_bot_messages (legal_business_id, conversation_id, direction, body, kind, wa_message_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [BUSINESS_ID, convId, direction, (body || "(not text)").slice(0, 2000), kind, waId]
    );
  };

  const isOwner = (await ownerNumbers()).includes(last10(number));
  if (isOwner) {
    await log("IN", text, "OWNER", m.id);
    const reply = await ownerAnswer(text);
    await log("OUT", reply, "OWNER");
    await sendWhatsAppText(number, reply);
    return;
  }

  const intent: Intent = text ? classify(text, String(conv.awaiting) as "NONE" | "PRODUCT" | "ORDER") : { kind: "OTHER" };
  await db.execute(`UPDATE acct_bot_conversations SET last_inbound_at = NOW(), last_text = ? WHERE id = ?`, [(text || "(not text)").slice(0, 500), convId]);

  // A person has answered from the phone recently: the bot stays quiet.
  if (Number(conv.human_on) === 1) {
    await log("IN", text, "OTHER", m.id);
    return;
  }

  const [recent] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n FROM acct_bot_messages WHERE conversation_id = ? AND direction = 'OUT' AND created_at > NOW() - INTERVAL 1 HOUR`, [convId]);
  if (Number(recent[0].n) >= 20) { await log("IN", text, "OTHER", m.id); return; }

  const firstContact = Number(conv.stale_greeting) === 1;
  const out = await decide(intent, text, number, String(conv.awaiting), firstContact);
  await log("IN", text, out.handoff ? "HANDOFF" : intent.kind, m.id);

  const alreadyWaiting = conv.status === "NEEDS_PERSON";
  if (out.handoff && !alreadyWaiting && !out.replies.some((r) => r.kind === "HANDOFF")) out.replies.push({ text: TEXT.handoff, kind: "HANDOFF" });
  if (out.handoff && alreadyWaiting) out.replies = out.replies.filter((r) => r.kind !== "HANDOFF");

  for (const r of out.replies) {
    await log("OUT", r.text, r.kind);
    await sendWhatsAppText(number, r.text);
  }
  await db.execute(
    `UPDATE acct_bot_conversations SET awaiting = ?, status = ?, greeted_at = CASE WHEN ? THEN NOW() ELSE greeted_at END WHERE id = ?`,
    [out.awaiting, out.handoff ? "NEEDS_PERSON" : conv.status === "DONE" ? "BOT" : conv.status, firstContact ? 1 : 0, convId]
  );
}

/** A person answered from the phone: the chat is looked after, and the bot stays quiet for 12 hours. */
export async function handleEcho(toNumber: string): Promise<void> {
  const number = toNumber.replace(/\D/g, "");
  if (!number) return;
  await db.execute(
    `UPDATE acct_bot_conversations SET status = CASE WHEN status = 'NEEDS_PERSON' THEN 'DONE' ELSE status END,
            human_active_until = NOW() + INTERVAL 12 HOUR, awaiting = 'NONE'
      WHERE legal_business_id = ? AND wa_number = ?`, [BUSINESS_ID, number]);
}
