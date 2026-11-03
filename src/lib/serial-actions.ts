"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { MAX_PIECES_AT_ONCE } from "@/lib/serial-limits";

const PAGE = "/accounting/serials";
const go = (kind: "saved" | "error", text: string): never => redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 200))}`);

async function ownVariant(businessId: number, id: number) {
  const [r] = await db.execute<RowDataPacket[]>(`SELECT id, track_serial FROM acct_product_variants WHERE legal_business_id = ? AND id = ?`, [businessId, id]);
  return r[0];
}

/** Switch piece-by-piece tracking on or off for one item. */
export async function setTrackingAction(form: FormData) {
  const user = await requireAccess("products");
  const id = Number(form.get("variant_id"));
  const on = form.get("on") === "1";
  try {
    if (!Number.isSafeInteger(id) || !(await ownVariant(user.legal_business_id, id))) return go("error", "Item not found.");
    await db.execute(`UPDATE acct_product_variants SET track_serial = ? WHERE legal_business_id = ? AND id = ?`, [on ? 1 : 0, user.legal_business_id, id]);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return go("error", "Not set up yet: run the database file 071_serials.");
  }
  revalidatePath(PAGE);
  return go("saved", on ? "This item is now tracked piece by piece." : "Tracking switched off for this item. Pieces already recorded are kept.");
}

/** Make N new piece codes (PC-00001...) for a tracked item. */
export async function addPiecesAction(form: FormData) {
  const user = await requireAccess("products");
  const id = Number(form.get("variant_id"));
  const count = Math.floor(Number(form.get("count")));
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PIECES_AT_ONCE) return go("error", `Enter how many pieces (1 to ${MAX_PIECES_AT_ONCE}).`);
  const v = Number.isSafeInteger(id) ? await ownVariant(user.legal_business_id, id) : undefined;
  if (!v || Number(v.track_serial) !== 1) return go("error", "Switch tracking on for this item first.");
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the business's serial rows' numbering so two people adding at once cannot get the same codes.
    await conn.execute(`SELECT id FROM acct_serials WHERE legal_business_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`, [user.legal_business_id]);
    for (let i = 0; i < count; i++) {
      const code = await nextCode(conn, { table: "acct_serials", column: "serial_no", prefix: "PC-", width: 5, where: "legal_business_id = ?", params: [user.legal_business_id] });
      await conn.execute(`INSERT INTO acct_serials (legal_business_id, variant_id, serial_no, created_by) VALUES (?, ?, ?, ?)`, [user.legal_business_id, id, code, user.id]);
    }
    await conn.commit();
  } catch {
    await conn.rollback();
    return go("error", "The pieces could not be added.");
  } finally { conn.release(); }
  revalidatePath(PAGE);
  return go("saved", `${count} piece code${count === 1 ? "" : "s"} added. Print the labels and stick them on the pieces.`);
}

/** A sold piece came back: it is in stock again. */
export async function backInStockAction(form: FormData) {
  const user = await requireAccess("products");
  const id = Number(form.get("serial_id"));
  try {
    await db.execute(`UPDATE acct_serials SET status = 'IN_STOCK', sale_id = NULL, sold_on = NULL WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, id]);
  } catch { return go("error", "Could not change this piece."); }
  revalidatePath(PAGE);
  return go("saved", "The piece is back in stock.");
}
