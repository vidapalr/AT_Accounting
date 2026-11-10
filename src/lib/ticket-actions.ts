"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { dayOk } from "@/lib/follow-up-math";
import { allowedNext, cleanTicketKind, cleanTicketStatus, isOpenStatus, type TicketStatus } from "@/lib/ticket-math";

const PAGE = "/accounting/tickets";
const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const isRedirect = (e: unknown) => !!e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");

/** Opens a ticket for a complaint, exchange request or alteration. The customer is matched by phone number when we know them. */
export async function createTicketAction(form: FormData): Promise<void> {
  const user = await requireAccess("customers");
  const biz = user.legal_business_id;
  const name = text(form, "contact_name", 160);
  const phone = text(form, "contact_phone", 20).replace(/\D/g, "").slice(-10);
  const summary = text(form, "summary", 200);
  const details = text(form, "details", 1000);
  const invoice = text(form, "invoice_no", 60);
  const follow = text(form, "follow_up_on", 10);
  const kind = cleanTicketKind(form.get("kind"));
  const back = (r: string) => redirect(`${PAGE}?result=${r}`);
  if (name.length < 2 || summary.length < 3 || (phone && phone.length !== 10)) back("invalid");
  if (follow && !dayOk(follow)) back("bad-day");

  let id = 0;
  let outcome = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let customerId: number | null = null;
    if (phone) {
      const [c] = await conn.execute<RowDataPacket[]>(`SELECT id FROM acct_customers WHERE legal_business_id = ? AND phone = ? LIMIT 1`, [biz, phone]);
      customerId = c[0] ? Number(c[0].id) : null;
    }
    let saleId: number | null = null;
    if (invoice) {
      const [s] = await conn.execute<RowDataPacket[]>(`SELECT id FROM acct_sales_headers WHERE legal_business_id = ? AND invoice_no = ? LIMIT 1`, [biz, invoice]);
      if (!s[0]) { outcome = "no-bill"; }
      else saleId = Number(s[0].id);
    }
    if (outcome !== "no-bill") {
      const ticketNo = await nextCode(conn, { table: "acct_service_tickets", column: "ticket_no", prefix: "TK-", width: 4, where: "legal_business_id = ?", params: [biz] });
      const [r] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_service_tickets (legal_business_id, ticket_no, kind, customer_id, contact_name, contact_phone, sale_id, summary, details, follow_up_on, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [biz, ticketNo, kind, customerId, name, phone || null, saleId, summary, details || null, follow || null, user.id]);
      id = r.insertId;
      await conn.execute(`INSERT INTO acct_service_ticket_log (legal_business_id, ticket_id, status_after, note, created_by) VALUES (?, ?, 'OPEN', ?, ?)`,
        [biz, id, "Ticket opened", user.id]);
      await conn.commit();
      outcome = "created";
    } else {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Create ticket failed", error);
    outcome = (error as { code?: string }).code === "ER_NO_SUCH_TABLE" ? "not-ready" : "failed";
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  if (outcome === "created") redirect(`${PAGE}/${id}?result=created`);
  back(outcome);
}

/** Moves a ticket on: change its state, write what was done, set the next follow-up day. */
export async function updateTicketAction(form: FormData): Promise<void> {
  const user = await requireAccess("customers");
  const biz = user.legal_business_id;
  const id = Number(form.get("id"));
  const back = (r: string) => redirect(`${PAGE}/${id}?result=${r}`);
  if (!Number.isSafeInteger(id) || id < 1) redirect(PAGE);
  const wanted = String(form.get("status") ?? "");
  const note = text(form, "note", 500);
  const follow = text(form, "follow_up_on", 10);
  const resolution = text(form, "resolution", 500);
  if (follow && !dayOk(follow)) back("bad-day");

  let outcome = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [t] = await conn.execute<RowDataPacket[]>(`SELECT status FROM acct_service_tickets WHERE legal_business_id = ? AND id = ? FOR UPDATE`, [biz, id]);
    if (!t[0]) { await conn.rollback(); redirect(PAGE); }
    const from = String(t[0].status) as TicketStatus;
    const to = wanted === "" || wanted === from ? from : cleanTicketStatus(wanted);
    if (!to || (to !== from && !allowedNext(from).includes(to))) { outcome = "bad-move"; }
    else if (to === from && !note && !follow && !resolution) { outcome = "nothing"; }
    else if ((to === "RESOLVED" || to === "CLOSED") && to !== from && !resolution && !note) { outcome = "need-resolution"; }
    else {
      const open = isOpenStatus(to);
      await conn.execute(
        `UPDATE acct_service_tickets SET status = ?, follow_up_on = ?, resolution = COALESCE(NULLIF(?, ''), resolution),
                resolved_at = IF(? = 1, NULL, COALESCE(resolved_at, NOW()))
          WHERE legal_business_id = ? AND id = ?`,
        [to, open ? (follow || null) : null, resolution, open ? 1 : 0, biz, id]);
      await conn.execute(`INSERT INTO acct_service_ticket_log (legal_business_id, ticket_id, status_after, note, created_by) VALUES (?, ?, ?, ?, ?)`,
        [biz, id, to, (note || resolution || (to !== from ? "Status changed" : "Follow-up changed")).slice(0, 500), user.id]);
      await conn.commit();
      outcome = "saved";
    }
    if (outcome !== "saved") await conn.rollback();
  } catch (error) {
    if (isRedirect(error)) throw error;
    await conn.rollback().catch(() => {});
    console.error("Update ticket failed", error);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${id}`);
  back(outcome);
}
