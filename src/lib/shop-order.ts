import "server-only";
import type { ResultSetHeader } from "mysql2";

import { db } from "@/lib/db";
import { nextCode } from "@/lib/codes";
import { getShopProducts, SHOP_BUSINESS_ID } from "@/lib/shop";
import { checkOrder, orderTotalPaise } from "@/lib/shop-order-math";

/** Looks up current shop prices and stock for the cart lines. Never trust prices sent by the browser. */
export async function currentLines(variantIds: number[]) {
  const products = await getShopProducts();
  const out: { variantId: number; productId: number; product: string; detail: string; price: number | null; listPrice: number | null; offerName: string | null; available: boolean; coverId: number | null }[] = [];
  for (const id of variantIds) {
    for (const p of products) {
      const v = p.variants.find((x) => x.id === id);
      if (v) {
        out.push({
          variantId: v.id, productId: p.id, product: p.name,
          detail: [v.size, v.color].filter(Boolean).join(", "), price: v.price, listPrice: v.listPrice, offerName: v.offerName, available: v.available, coverId: p.coverId,
        });
        break;
      }
    }
  }
  return out;
}

export type PlaceOrderResult = { ok: true; orderNo: string; total: number } | { ok: false; error: string };

export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const checked = checkOrder(raw);
  if (!checked.ok) return checked;
  const { order } = checked;

  const found = await currentLines(order.lines.map((l) => l.variantId));
  const priced: { variantId: number; product: string; detail: string; qty: number; unitPrice: number; listPrice: number | null; offerName: string | null }[] = [];
  for (const l of order.lines) {
    const f = found.find((x) => x.variantId === l.variantId);
    if (!f) return { ok: false, error: "One item in your cart is no longer on the shop. Please review your cart." };
    if (!f.available) return { ok: false, error: `${f.product} is out of stock right now. Please remove it from your cart.` };
    if (f.price === null) return { ok: false, error: `${f.product} has no online price yet. Please ask us on WhatsApp.` };
    priced.push({ variantId: f.variantId, product: f.product, detail: f.detail, qty: l.qty, unitPrice: f.price, listPrice: f.listPrice, offerName: f.offerName });
  }
  const totalPaise = orderTotalPaise(priced.map((p) => ({ unitPrice: p.unitPrice, qty: p.qty })));
  const total = Number(totalPaise) / 100;

  for (let attempt = 0; attempt < 3; attempt++) {
    const conn = await db.getConnection();
    try {
      const orderNo = await nextCode(conn, {
        table: "acct_online_orders", column: "order_no", prefix: "WEB-", width: 5,
        where: "legal_business_id = ?", params: [SHOP_BUSINESS_ID],
      });
      await conn.beginTransaction();
      const [head] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_online_orders
           (legal_business_id, order_no, customer_name, phone, email, country, address_line, city, state_region, postal_code, customer_note, items_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [SHOP_BUSINESS_ID, orderNo, order.name, order.phone, order.email || null, order.country, order.address,
         order.city, order.state || null, order.postal || null, order.note || null, total.toFixed(2)]
      );
      for (const p of priced) {
        await conn.execute(
          `INSERT INTO acct_online_order_lines (order_id, variant_id, product_name, detail, quantity, unit_price, list_price, offer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [head.insertId, p.variantId, p.product.slice(0, 200), p.detail.slice(0, 120) || null, p.qty, p.unitPrice.toFixed(2),
           p.offerName && p.listPrice !== null ? p.listPrice.toFixed(2) : null, p.offerName]
        );
      }
      await conn.commit();
      return { ok: true, orderNo, total };
    } catch (error) {
      await conn.rollback().catch(() => {});
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") {
        console.error("Online order failed:", error);
        return { ok: false, error: "Sorry, we could not save your order. Please try again or message us on WhatsApp." };
      }
    } finally {
      conn.release();
    }
  }
  return { ok: false, error: "Sorry, we are busy. Please try again in a moment." };
}
