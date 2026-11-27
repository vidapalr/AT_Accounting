"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { cancelSaleInTx } from "@/lib/sale-cancel";

/** Cancels a whole bill (owner only); see cancelSaleInTx for what happens. */
export async function cancelSaleAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const saleId = Number(form.get("sale_id"));
  const why = String(form.get("why") ?? "").trim().replace(/\s+/g, " ").slice(0, 250);
  const money = String(form.get("money") ?? "") === "credit" ? "credit" : "refund";
  if (!Number.isSafeInteger(saleId) || saleId <= 0) redirect("/accounting/invoices");
  const back = `/accounting/sales/${saleId}`;
  if (why.length < 3) redirect(`${back}?pay=cancel-why`);

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);
    await cancelSaleInTx(conn, { businessId, userId: user.id, saleId, why, money });
    await conn.commit();
    result = "cancelled";
  } catch (e) {
    await conn.rollback().catch(() => {});
    const m = (e as Error).message ?? "";
    result = m.startsWith("cancel-") || m === "invalid" ? m : "failed";
    if (result === "failed") console.error("Cancel bill failed:", e);
  } finally {
    conn.release();
  }
  revalidatePath("/accounting/invoices");
  revalidatePath(back);
  redirect(`${back}?pay=${result}`);
}
