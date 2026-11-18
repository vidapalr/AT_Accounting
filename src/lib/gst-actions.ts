"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { GSTIN_PATTERN, GST_STATES, parseRate, validHsn } from "@/lib/gst";
import { isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { nextCode } from "@/lib/codes";
import { parseRupees } from "@/lib/reports/money";
import { loadGstConfig } from "@/lib/gst/data";
import { gstPeriod, paymentFigures } from "@/lib/gst/period";
import { periodRange } from "@/lib/gst/returns";

const STATUSES = new Set(["NOT_REGISTERED", "REGULAR", "COMPOSITION"]);

/** Owner only. Saves the GST choices. Nothing on invoices changes yet. */
export async function saveGstSettingsAction(formData: FormData) {
  const user = await requireGroupOwner();
  const status = String(formData.get("status") ?? "");
  const gstin = String(formData.get("gstin") ?? "").trim().toUpperCase();
  const stateCode = String(formData.get("state_code") ?? "");
  // Selling prices always include GST (the tag price is what the customer pays).
  const inclusive = "1";
  const effective = String(formData.get("effective_date") ?? "");
  const compRate = String(formData.get("composition_rate") ?? "1").trim();

  const registered = status !== "NOT_REGISTERED";
  if (
    !STATUSES.has(status) ||
    (registered && !GSTIN_PATTERN.test(gstin)) ||
    (registered && gstin.slice(0, 2) !== stateCode) ||
    (stateCode !== "" && !GST_STATES.some(s => s.code === stateCode)) ||
    (registered && !/^\d{4}-\d{2}-\d{2}$/.test(effective)) ||
    !/^\d{1,2}(\.\d{1,2})?$/.test(compRate)
  ) {
    redirect("/accounting/gst-settings?result=invalid");
  }

  const values: Array<[string, string]> = [
    ["gst_status", status],
    ["gst_gstin", registered ? gstin : ""],
    ["gst_state_code", stateCode],
    ["gst_prices_inclusive", inclusive],
    ["gst_effective_date", registered ? effective : ""],
    ["gst_composition_rate", compRate],
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

/** Save HSN code, GST rate and the price rule (higher rate above a price per piece) for many products at once. */
export async function saveProductGstAction(formData: FormData) {
  const user = await requireAccess("products");
  type Entry = { hsn?: string; rate?: string; high?: string; limit?: string };
  const updates = new Map<number, Entry>();

  for (const [key, raw] of formData.entries()) {
    const m = /^(hsn|rate|high|limit)_(\d+)$/.exec(key);
    if (!m) continue;
    const id = Number(m[2]);
    const entry = updates.get(id) ?? {};
    entry[m[1] as keyof Entry] = String(raw).trim();
    updates.set(id, entry);
  }

  const rows: Array<[string | null, string | null, string | null, string | null, number]> = [];
  for (const [id, { hsn = "", rate = "", high = "", limit = "" }] of updates) {
    const parsed = parseRate(rate);
    const parsedHigh = parseRate(high);
    const limitOk = limit === "" || /^\d{1,9}(\.\d{1,2})?$/.test(limit);
    // A price rule needs both the higher rate and the price.
    if (!validHsn(hsn) || !parsed.ok || !parsedHigh.ok || !limitOk || (high === "") !== (limit === "")) redirect("/accounting/products/gst?result=invalid");
    rows.push([hsn === "" ? null : hsn, parsed.rate, parsedHigh.rate, limit === "" ? null : limit, id]);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const [hsn, rate, high, limit, id] of rows) {
      await conn.execute(
        `UPDATE acct_products SET hsn_code = ?, gst_rate = ? WHERE id = ? AND legal_business_id = ?`,
        [hsn, rate, id, user.legal_business_id]
      );
      await conn
        .execute(`UPDATE acct_products SET gst_rate_high = ?, gst_price_limit = ? WHERE id = ? AND legal_business_id = ?`, [high, limit, id, user.legal_business_id])
        .catch((e) => {
          if (!isMissingColumn(e)) throw e; // migration 090 not run: the price rule is kept for later
        });
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

/**
 * Garments and made-ups (HSN starting 61, 62 or 63): 5% up to Rs 2,500 a piece, 18% above.
 * Fills only products with such an HSN code; other products are left as they are.
 */
export async function applyGarmentRuleAction() {
  const user = await requireAccess("products");
  try {
    await db.execute(
      `UPDATE acct_products SET gst_rate = 5, gst_rate_high = 18, gst_price_limit = 2500
        WHERE legal_business_id = ? AND (hsn_code LIKE '61%' OR hsn_code LIKE '62%' OR hsn_code LIKE '63%')`,
      [user.legal_business_id]
    );
  } catch (e) {
    if (isMissingColumn(e)) redirect("/accounting/products/gst?result=needs-090");
    throw e;
  }
  revalidatePath("/accounting/products/gst");
  redirect("/accounting/products/gst?result=garments");
}

const GST_PAGE = "/accounting/gst";
const pText = (p: bigint) => `${p < 0n ? "-" : ""}${(p < 0n ? -p : p) / 100n}.${String((p < 0n ? -p : p) % 100n).padStart(2, "0")}`;

/**
 * Record the GST paid for a return period. The amounts are worked out again here from the period's
 * bills, purchases and expenses, so the books always match the return; only the date, the account,
 * the challan number and any interest or late fee are typed.
 */
export async function recordGstPaymentAction(formData: FormData) {
  const user = await requireAccess("tax");
  const businessId = user.legal_business_id;
  const ym = String(formData.get("ym") ?? "");
  const back = `${GST_PAGE}?ym=${encodeURIComponent(ym)}`;
  const fail = (msg: string): never => redirect(`${back}&error=${encodeURIComponent(msg)}`);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) fail("Choose the month.");
  const paidOn = String(formData.get("paid_on") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) fail("Write the date the GST was paid.");
  const account = String(formData.get("account") ?? "");
  const bank = /^BANK:([1-9]\d*)$/.exec(account);
  const cash = /^CASH:([1-9]\d*)$/.exec(account);
  if (!bank && !cash) fail("Choose the account the GST was paid from.");
  const feeText = String(formData.get("interest_fee") ?? "").trim();
  const fee = feeText ? parseRupees(feeText) : 0n;
  if (fee === null || fee < 0n) fail("Write interest and late fee as a number, or leave it empty.");

  const cfg = await loadGstConfig(db, businessId);
  if (cfg.scheme === "NOT_REGISTERED") fail("GST is not switched on in GST settings.");
  const range = periodRange(cfg.scheme === "COMPOSITION" ? "QUARTER" : "MONTH", ym);
  const p = await gstPeriod(businessId, range.from, range.to);
  if (p.alreadyPaid) fail("GST for this period is already recorded. Remove that payment first to record it again.");
  const f = paymentFigures(p);
  const comp = cfg.scheme === "COMPOSITION" ? p.composition.tax.cgst + p.composition.tax.sgst : 0n;
  const settled = cfg.scheme === "COMPOSITION" ? { cgst: 0n, sgst: 0n, igst: 0n } : f.settled;
  const used = cfg.scheme === "COMPOSITION" ? { cgst: 0n, sgst: 0n, igst: 0n } : f.used;
  const cashHeads = cfg.scheme === "COMPOSITION" ? 0n : f.cash.cgst + f.cash.sgst + f.cash.igst;
  const cashTotal = cashHeads + f.rcm + comp + (fee ?? 0n);
  if (cashTotal <= 0n && settled.cgst + settled.sgst + settled.igst === 0n) fail("There is nothing to pay for this period.");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const no = await nextCode(conn, { table: "acct_gst_payments", column: "payment_no", prefix: "GSTP-", width: 4, where: "legal_business_id = ?", params: [businessId] });
    await conn.execute(
      `INSERT INTO acct_gst_payments (legal_business_id, payment_no, scheme, period_from, period_to, paid_on, settled_cgst, settled_sgst, settled_igst,
         itc_cgst, itc_sgst, itc_igst, rcm_cash, composition_tax, interest_fee, cash_total, paid_from, bank_account_id, cash_account_id, challan_ref, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, no, cfg.scheme, range.from, range.to, paidOn, pText(settled.cgst), pText(settled.sgst), pText(settled.igst),
       pText(used.cgst), pText(used.sgst), pText(used.igst), pText(f.rcm), pText(comp), pText(fee ?? 0n), pText(cashTotal),
       bank ? "BANK" : "CASH", bank ? Number(bank[1]) : null, cash ? Number(cash[1]) : null,
       String(formData.get("challan_ref") ?? "").trim().slice(0, 40) || null, String(formData.get("note") ?? "").trim().slice(0, 250) || null, user.id]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (isMissingTable(e)) fail("Run migration 090 in phpMyAdmin first.");
    throw e;
  } finally {
    conn.release();
  }
  revalidatePath(GST_PAGE);
  redirect(`${back}&saved=${encodeURIComponent(`GST paid for ${range.label}: ₹${pText(cashTotal)} from the account; ₹${pText(used.cgst + used.sgst + used.igst)} set off from input credit.`)}`);
}

/** Take back a GST payment entered by mistake (its journal is reversed by the ledger sync). */
export async function cancelGstPaymentAction(formData: FormData) {
  const user = await requireAccess("tax");
  const ym = String(formData.get("ym") ?? "");
  await db.execute(`UPDATE acct_gst_payments SET status = 'CANCELLED' WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, Number(formData.get("id"))]);
  revalidatePath(GST_PAGE);
  redirect(`${GST_PAGE}?ym=${encodeURIComponent(ym)}&saved=${encodeURIComponent("Payment removed.")}`);
}
