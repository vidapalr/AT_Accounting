import "server-only";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { orderMail, ownerAlert } from "@/lib/shop-mail-text";

type Status = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

/** Emails the customer about their order. Never throws: a mail problem must not stop an order. */
export async function emailOrderStatus(orderId: number, status: Status): Promise<void> {
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT o.order_no, o.customer_name, o.country, o.items_total, o.shipping_charge, o.staff_note,
              COALESCE(NULLIF(o.email, ''), c.email) AS to_email,
              (SELECT COUNT(*) FROM acct_online_order_lines l WHERE l.order_id = o.id) AS line_count
         FROM acct_online_orders o LEFT JOIN acct_shop_customers c ON c.id = o.shop_customer_id
        WHERE o.id = ?`,
      [orderId]
    );
    const o = rows[0];
    if (!o) return;
    const info = { orderNo: String(o.order_no), name: String(o.customer_name), items: Number(o.items_total), shipping: Number(o.shipping_charge ?? 0), country: String(o.country), note: o.staff_note ? String(o.staff_note) : null };
    if (o.to_email) await sendMail(String(o.to_email), orderMail(status, info));
    const owner = (process.env.SHOP_NOTIFY_EMAIL ?? "").trim();
    if (status === "REQUESTED" && owner) {
      await sendMail(owner, ownerAlert({ orderNo: info.orderNo, name: info.name, country: info.country, items: info.items, lines: Number(o.line_count) }));
    }
  } catch (error) {
    console.error("Order email failed:", (error as Error).message);
  }
}
