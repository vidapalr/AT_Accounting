"use server";

import { randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { shopBaseUrl } from "@/lib/shop-url";
import { normalizePhone, whatsappLink } from "@/lib/whatsapp/core";

type Row = RowDataPacket & Record<string, string | number | null>;
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Gives back a WhatsApp link with the customer's number and a private link to their bill. The page opens it in a new tab; staff press send. */
export async function billWhatsAppLinkAction(saleId: number): Promise<{ url?: string; error?: string }> {
  const user = await requireAccess("sales");
  const back = (m: string) => ({ error: m });
  if (!Number.isSafeInteger(saleId) || saleId <= 0) return back("That bill was not found.");

  const [rows] = await db.execute<Row[]>(
    `SELECT s.id, s.invoice_no, s.status, s.customer_name, s.customer_phone, s.grand_total,
            COALESCE((SELECT SUM(p.amount) FROM acct_sales_payments p
                       WHERE p.legal_business_id = s.legal_business_id AND p.sale_id = s.id AND p.status = 'RECORDED'), 0) AS paid
       FROM acct_sales_headers s WHERE s.legal_business_id = ? AND s.id = ?`,
    [user.legal_business_id, saleId]
  );
  const s = rows[0];
  if (!s) return back("That bill was not found.");
  if (s.status !== "POSTED") return back("Confirm the sale before sending the bill.");
  const phone = normalizePhone(String(s.customer_phone ?? ""));
  if (!phone) return back("Add the customer's mobile number first.");

  let token: string;
  const [existing] = await db.execute<Row[]>(
    `SELECT token FROM acct_invoice_shares WHERE legal_business_id = ? AND sale_id = ?`, [user.legal_business_id, saleId]
  );
  if (existing[0]) token = String(existing[0].token);
  else {
    token = randomBytes(16).toString("hex");
    await db.execute(
      `INSERT IGNORE INTO acct_invoice_shares (legal_business_id, sale_id, token, created_by) VALUES (?, ?, ?, ?)`,
      [user.legal_business_id, saleId, token, user.id]
    );
    const [again] = await db.execute<Row[]>(`SELECT token FROM acct_invoice_shares WHERE legal_business_id = ? AND sale_id = ?`, [user.legal_business_id, saleId]);
    token = String(again[0].token);
  }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'BILL_SENT_WHATSAPP', 'SALE', ?, ?)`,
    [user.legal_business_id, user.id, saleId, JSON.stringify({ invoiceNo: s.invoice_no })]
  );

  const total = Number(s.grand_total);
  const due = Math.max(0, total - Number(s.paid));
  const name = String(s.customer_name ?? "").trim();
  const text =
    `Hello${name ? ` ${name}` : ""}, thanks for shopping with Abhiram Textiles.\n` +
    `Your bill ${s.invoice_no}: ${inr(total)}${due > 0 ? ` (balance due ${inr(due)})` : " (paid in full)"}.\n` +
    `See your bill: ${shopBaseUrl()}/shop/bill/${token}`;
  return { url: whatsappLink(phone, text) };
}
