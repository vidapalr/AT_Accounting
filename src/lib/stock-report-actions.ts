"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-phone";
import { applyStockDamage, UserError } from "@/lib/stock-damage";
import { findReporterByPhone, saveStockDrafts } from "@/lib/stock-drafts";

const PAGE = "/accounting/stock-reports";
function go(q: string): never {
  redirect(`${PAGE}?${q}`);
}
const text = (f: FormData, n: string) => String(f.get(n) ?? "").trim();

export async function addReporterAction(formData: FormData) {
  const user = await requireAccess("stock");
  const name = text(formData, "full_name").slice(0, 80);
  const phone = normalizePhone(text(formData, "phone"));
  const locationId = Number(text(formData, "location_id"));
  if (!name || !phone || !Number.isInteger(locationId) || locationId <= 0) go("result=invalid");

  const [loc] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_inventory_locations WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`,
    [locationId, user.legal_business_id]
  );
  if (loc.length !== 1) go("result=invalid");
  try {
    await db.execute(
      `INSERT INTO acct_stock_reporters (legal_business_id, full_name, phone, location_id, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [user.legal_business_id, name, phone, locationId, user.id]
    );
  } catch {
    go("result=duplicate");
  }
  revalidatePath(PAGE);
  go("result=reporter-added");
}

export async function toggleReporterAction(formData: FormData) {
  const user = await requireAccess("stock");
  const id = Number(text(formData, "id"));
  if (!Number.isInteger(id) || id <= 0) go("result=invalid");
  await db.execute(
    `UPDATE acct_stock_reporters
        SET status = IF(status = 'ACTIVE', 'PAUSED', 'ACTIVE')
      WHERE id = ? AND legal_business_id = ?`,
    [id, user.legal_business_id]
  );
  revalidatePath(PAGE);
  go("result=reporter-updated");
}

export async function pasteMessageAction(formData: FormData) {
  const user = await requireAccess("stock");
  const body = text(formData, "message").slice(0, 4000);
  const phone = normalizePhone(text(formData, "phone"));
  if (!body || !phone) go("result=invalid");
  const reporter = await findReporterByPhone(db, user.legal_business_id, phone);
  if (!reporter) go("result=unknown-staff");
  const r = await saveStockDrafts({
    businessId: user.legal_business_id,
    source: "PASTED",
    reporter: reporter!,
    text: body,
  });
  revalidatePath(PAGE);
  go(`result=pasted&n=${r.saved}&p=${r.problems}`);
}

export async function rejectDraftAction(formData: FormData) {
  const user = await requireAccess("stock");
  const id = Number(text(formData, "id"));
  await db.execute(
    `UPDATE acct_stock_drafts SET status = 'REJECTED', decided_by = ?, decided_at = NOW()
      WHERE id = ? AND legal_business_id = ? AND status = 'PENDING'`,
    [user.id, id, user.legal_business_id]
  );
  revalidatePath(PAGE);
  go("result=rejected");
}

/**
 * Approve one report.
 * - Damaged / lost: stock is reduced right away (same record as the Returns page).
 * - Count: nothing is changed; the owner sees the difference and decides.
 * - Received / sold: marked as acknowledged. They need a purchase or a bill with
 *   money and tax details, so the page links to those screens.
 */
export async function approveDraftAction(formData: FormData) {
  const user = await requireAccess("stock");
  const id = Number(text(formData, "id"));
  const businessId = user.legal_business_id;
  let note = "";
  let ok = false;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT * FROM acct_stock_drafts WHERE id = ? AND legal_business_id = ? AND status = 'PENDING' FOR UPDATE`,
        [id, businessId]
      );
      const d = rows[0];
      if (!d) throw new UserError("This report was already handled.");
      if (d.problem || !d.variant_id || !d.quantity) throw new UserError("This line has a problem. Reject it.");

      if (d.action === "DAMAGED" || d.action === "LOST") {
        const qty = Number(d.quantity);
        const done = await applyStockDamage(conn, {
          businessId,
          userId: user.id,
          locationId: Number(d.location_id),
          variantId: Number(d.variant_id),
          date: new Date().toISOString().slice(0, 10),
          reason: d.action,
          remarks: `Reported by ${d.reporter_name} on WhatsApp${d.note ? `: ${d.note}` : ""}`.slice(0, 500),
          qtyMilli: BigInt(Math.round(qty * 1000)),
        });
        note = `Stock reduced by ${qty}. Record #${done.id}.`;
      } else if (d.action === "COUNT") {
        const [cur] = await conn.execute<RowDataPacket[]>(
          `SELECT COALESCE(SUM(quantity_change), 0) AS qty FROM acct_stock_movements
            WHERE legal_business_id = ? AND location_id = ? AND variant_id = ?`,
          [businessId, d.location_id, d.variant_id]
        );
        const system = Number(cur[0].qty);
        const diff = Number(d.quantity) - system;
        note = diff === 0 ? "Count matches the system." : `Counted ${Number(d.quantity)}, system shows ${system} (difference ${diff > 0 ? "+" : ""}${diff}).`;
      } else if (d.action === "RECEIVED") {
        note = "Acknowledged. Record the purchase in Buy stock to add it to stock.";
      } else {
        note = "Acknowledged. Make the bill in Sell to record the sale.";
      }

      await conn.execute(
        `UPDATE acct_stock_drafts SET status = 'DONE', decided_by = ?, decided_at = NOW(), result_note = ? WHERE id = ?`,
        [user.id, note.slice(0, 250), id]
      );
      await conn.commit();
      ok = true;
    } catch (error) {
      await conn.rollback();
      note = error instanceof UserError || (error instanceof Error && /Invalid/.test(error.message))
        ? error.message : "Could not approve. Nothing was changed.";
    }
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  if (!ok) go(`error=${encodeURIComponent(note.slice(0, 200))}`);
  go(`result=approved&note=${encodeURIComponent(note)}`);
}
