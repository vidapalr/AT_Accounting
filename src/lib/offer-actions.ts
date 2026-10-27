"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

const PAGE = "/accounting/offers";
const back = (kind: "saved" | "error", text: string): never =>
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 200))}`);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export async function saveOfferAction(formData: FormData) {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const t = (n: string) => String(formData.get(n) ?? "").trim();

  const name = t("name").slice(0, 80);
  const channel = t("channel");
  const kind = t("kind");
  const scope = t("scope");
  const value = Number(t("value").replace(/,/g, ""));
  const fabric = t("fabric").slice(0, 100);
  const starts = t("starts_on");
  const ends = t("ends_on");
  const productIds = [...new Set(formData.getAll("product_ids").map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 300);

  if (name.length < 2) return back("error", "Give the offer a name, for example Diwali 10%.");
  if (!["STORE", "ONLINE", "BOTH"].includes(channel)) return back("error", "Choose where the offer applies.");
  if (!["PERCENT", "AMOUNT_OFF", "FIXED_PRICE"].includes(kind)) return back("error", "Choose the kind of offer.");
  if (!Number.isFinite(value) || value <= 0) return back("error", "Enter the offer amount as a number above zero.");
  if (kind === "PERCENT" && value > 90) return back("error", "A percent offer cannot be more than 90.");
  if (!["ALL", "FABRIC", "PRODUCTS"].includes(scope)) return back("error", "Choose what the offer covers.");
  if (scope === "FABRIC" && fabric === "") return back("error", "Type the fabric this offer covers, for example Cotton.");
  if (scope === "PRODUCTS" && productIds.length === 0) return back("error", "Choose at least one product.");
  if (starts && !isDate(starts)) return back("error", "The start date is not valid.");
  if (ends && !isDate(ends)) return back("error", "The end date is not valid.");
  if (starts && ends && ends < starts) return back("error", "The end date is before the start date.");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute(
      `INSERT INTO acct_offers (legal_business_id, offer_name, channel, kind, offer_value, scope, fabric, starts_on, ends_on, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, name, channel, kind, value.toFixed(2), scope, scope === "FABRIC" ? fabric : null, starts || null, ends || null, user.id]
    );
    const offerId = (res as { insertId: number }).insertId;
    if (scope === "PRODUCTS") {
      for (const pid of productIds) {
        await conn.execute(
          `INSERT INTO acct_offer_products (offer_id, product_id)
           SELECT ?, id FROM acct_products WHERE id = ? AND legal_business_id = ?`,
          [offerId, pid, businessId]
        );
      }
    }
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'OFFER_CREATED', 'OFFER', ?, ?)`,
      [businessId, user.id, offerId, JSON.stringify({ name, channel, kind, value, scope })]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Offer save failed:", error);
    return back("error", "Could not save the offer.");
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/shop");
  return back("saved", `Offer "${name}" saved.`);
}

/** Pause, resume or delete an offer. */
export async function changeOfferAction(formData: FormData) {
  const user = await requireAccess("products");
  const id = Number(formData.get("offer_id"));
  const op = String(formData.get("op") ?? "");
  if (!Number.isInteger(id) || id <= 0 || !["PAUSE", "RESUME", "DELETE"].includes(op)) return back("error", "That did not work.");
  if (op === "DELETE") {
    await db.execute(`DELETE FROM acct_offers WHERE id = ? AND legal_business_id = ?`, [id, user.legal_business_id]);
  } else {
    await db.execute(`UPDATE acct_offers SET status = ? WHERE id = ? AND legal_business_id = ?`, [op === "PAUSE" ? "PAUSED" : "ACTIVE", id, user.legal_business_id]);
  }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'OFFER_CHANGED', 'OFFER', ?, ?)`,
    [user.legal_business_id, user.id, id, JSON.stringify({ op })]
  );
  revalidatePath(PAGE);
  revalidatePath("/shop");
  return back("saved", op === "DELETE" ? "Offer deleted." : op === "PAUSE" ? "Offer paused." : "Offer is on again.");
}
