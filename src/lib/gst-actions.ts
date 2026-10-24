"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { GSTIN_PATTERN, GST_STATES, parseRate, validHsn } from "@/lib/gst";

const STATUSES = new Set(["NOT_REGISTERED", "REGULAR", "COMPOSITION"]);

/** Owner only. Saves the GST choices. Nothing on invoices changes yet. */
export async function saveGstSettingsAction(formData: FormData) {
  const user = await requireGroupOwner();
  const status = String(formData.get("status") ?? "");
  const gstin = String(formData.get("gstin") ?? "").trim().toUpperCase();
  const stateCode = String(formData.get("state_code") ?? "");
  const inclusive = String(formData.get("inclusive") ?? "1") === "0" ? "0" : "1";
  const effective = String(formData.get("effective_date") ?? "");

  const registered = status !== "NOT_REGISTERED";
  if (
    !STATUSES.has(status) ||
    (registered && !GSTIN_PATTERN.test(gstin)) ||
    (registered && gstin.slice(0, 2) !== stateCode) ||
    (stateCode !== "" && !GST_STATES.some(s => s.code === stateCode)) ||
    (registered && !/^\d{4}-\d{2}-\d{2}$/.test(effective))
  ) {
    redirect("/accounting/gst-settings?result=invalid");
  }

  const values: Array<[string, string]> = [
    ["gst_status", status],
    ["gst_gstin", registered ? gstin : ""],
    ["gst_state_code", stateCode],
    ["gst_prices_inclusive", inclusive],
    ["gst_effective_date", registered ? effective : ""],
  ];
  for (const [key, value] of values) {
    await db.execute(
      `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [user.legal_business_id, key, value, user.id]
    );
  }
  revalidatePath("/accounting/gst-settings");
  redirect("/accounting/gst-settings?result=saved");
}

/** Save HSN code and GST rate for many products at once. */
export async function saveProductGstAction(formData: FormData) {
  const user = await requireAccess("products");
  const updates = new Map<number, { hsn?: string; rate?: string }>();

  for (const [key, raw] of formData.entries()) {
    const m = /^(hsn|rate)_(\d+)$/.exec(key);
    if (!m) continue;
    const id = Number(m[2]);
    const entry = updates.get(id) ?? {};
    entry[m[1] as "hsn" | "rate"] = String(raw).trim();
    updates.set(id, entry);
  }

  const rows: Array<[string | null, string | null, number]> = [];
  for (const [id, { hsn = "", rate = "" }] of updates) {
    const parsed = parseRate(rate);
    if (!validHsn(hsn) || !parsed.ok) redirect("/accounting/products/gst?result=invalid");
    rows.push([hsn === "" ? null : hsn, parsed.rate, id]);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const [hsn, rate, id] of rows) {
      await conn.execute(
        `UPDATE acct_products SET hsn_code = ?, gst_rate = ? WHERE id = ? AND legal_business_id = ?`,
        [hsn, rate, id, user.legal_business_id]
      );
    }
    await conn.commit();
  } catch {
    await conn.rollback();
    redirect("/accounting/products/gst?result=failed");
  } finally {
    conn.release();
  }
  revalidatePath("/accounting/products/gst");
  redirect("/accounting/products/gst?result=saved");
}
