"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { getActiveDivisionId } from "@/lib/division-context";
import { depreciationDue, monthIndex, monthsToRun } from "@/lib/asset-math";
import { todayInIndia } from "@/lib/reports/money";

const PAGE = "/accounting/fixed-assets";
type Row = RowDataPacket & Record<string, string | number | null>;
const isRedirect = (e: unknown) =>
  typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT");
class Stop extends Error {}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
function paise(value: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.replace(/,/g, "").trim());
  return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0") : -1n;
}
const rupees = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;
const monthOf = (iso: string) => iso.slice(0, 7);

async function run(work: (conn: PoolConnection) => Promise<string>): Promise<never> {
  const conn = await db.getConnection();
  let target = `${PAGE}?error=${encodeURIComponent("Something went wrong. Nothing was saved.")}`;
  try {
    await conn.beginTransaction();
    target = await work(conn);
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (isRedirect(error)) throw error;
    if (error instanceof Stop) target = `${PAGE}?error=${encodeURIComponent(error.message)}`;
    else console.error("Asset action failed:", error);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  redirect(target);
}

/** Where the money goes or came from: "BANK:3", "CASH:2" -> a usable account of this business. */
async function pickAccount(conn: PoolConnection, businessId: number, value: string, direction: "pay" | "receive") {
  const [kind, rawId] = value.split(":");
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Stop("Choose the bank or cash account");
  if (kind === "CASH") {
    const [r] = await conn.execute<Row[]>(`SELECT id FROM acct_cash_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`, [businessId, id]);
    if (r.length !== 1) throw new Stop("That cash account cannot be used");
    return { bankId: null, cashId: id };
  }
  if (kind === "BANK") {
    const [r] = await conn.execute<Row[]>(
      `SELECT id FROM acct_bank_accounts WHERE legal_business_id = ? AND id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE'
         AND verification_status = 'VERIFIED' AND ${direction === "pay" ? "can_send" : "can_receive"} = 1`,
      [businessId, id]
    );
    if (r.length !== 1) throw new Stop("That bank account cannot be used");
    return { bankId: id, cashId: null };
  }
  throw new Stop("Choose the bank or cash account");
}

export async function addAssetAction(form: FormData): Promise<void> {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const divisionId = await getActiveDivisionId(user);
  const name = text(form, "asset_name").slice(0, 160);
  const category = text(form, "category");
  const date = text(form, "purchase_date");
  const cost = paise(text(form, "cost"));
  const salvage = text(form, "salvage_value") === "" ? 0n : paise(text(form, "salvage_value"));
  const years = Number(text(form, "life_years"));
  const paidFrom = text(form, "paid_from"); // BANK:3 | CASH:2 | EARLIER
  const remarks = text(form, "remarks").slice(0, 500);

  const fail = (m: string) => redirect(`${PAGE}?error=${encodeURIComponent(m)}`);
  if (name.length < 2) fail("Enter the name of the asset");
  if (!["FURNITURE_FITTINGS", "MACHINERY", "COMPUTERS", "VEHICLE", "OTHER"].includes(category)) fail("Choose the kind of asset");
  if (!validDate(date) || date > todayInIndia()) fail("Check the date bought");
  if (cost <= 0n) fail("Enter what it cost");
  if (salvage < 0n || salvage >= cost) fail("The value left at the end must be less than the cost");
  if (!Number.isInteger(years) || years < 1 || years > 50) fail("How many years it lasts: a whole number from 1 to 50");
  if (paidFrom !== "EARLIER" && !/^(BANK|CASH):\d+$/.test(paidFrom)) fail("Choose how it was paid");

  await run(async (conn) => {
    let bankId: number | null = null;
    let cashId: number | null = null;
    if (paidFrom !== "EARLIER") ({ bankId, cashId } = await pickAccount(conn, businessId, paidFrom, "pay"));
    const assetNo = await nextCode(conn, { table: "acct_fixed_assets", column: "asset_no", prefix: "FA-", width: 4, where: "legal_business_id = ?", params: [businessId] });
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_fixed_assets (legal_business_id, division_id, asset_no, asset_name, category, purchase_date, cost, salvage_value, life_months,
                                      paid_from, bank_account_id, cash_account_id, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, divisionId, assetNo, name, category, date, rupees(cost), rupees(salvage), years * 12,
       paidFrom === "EARLIER" ? "EARLIER" : bankId ? "BANK" : "CASH", bankId, cashId, remarks || null, user.id]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, 'FIXED_ASSET_ADDED', 'FIXED_ASSET', ?, ?)`,
      [businessId, user.id, ins.insertId, JSON.stringify({ assetNo, name, cost: rupees(cost) })]
    );
    return `${PAGE}?saved=${encodeURIComponent(`${assetNo} added.`)}`;
  });
}

/** Work out depreciation for every month still to do, up to and including `upTo` (a completed month). */
export async function runDepreciationAction(form: FormData): Promise<void> {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const divisionId = await getActiveDivisionId(user);
  const upTo = text(form, "up_to");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(upTo)) redirect(`${PAGE}?error=${encodeURIComponent("Choose the month")}`);

  await run(async (conn) => {
    if (monthIndex(upTo) >= monthIndex(todayInIndia().slice(0, 7))) throw new Stop("Only finished months can be charged. Choose last month or earlier");
    const [assets] = await conn.execute<Row[]>(
      `SELECT a.id, DATE_FORMAT(a.purchase_date, '%Y-%m') AS pm, a.cost, a.salvage_value, a.life_months, a.status,
              DATE_FORMAT(a.disposed_on, '%Y-%m') AS dm,
              COALESCE((SELECT SUM(x.amount) FROM acct_asset_depreciation x WHERE x.asset_id = a.id), 0) AS charged
         FROM acct_fixed_assets a WHERE a.legal_business_id = ? AND a.division_id = ? ORDER BY a.id FOR UPDATE`,
      [businessId, divisionId]
    );
    if (assets.length === 0) throw new Stop("There are no assets yet");
    const [last] = await conn.execute<Row[]>(`SELECT MAX(period) AS p FROM acct_asset_dep_runs WHERE legal_business_id = ? AND division_id = ?`, [businessId, divisionId]);
    const first = assets.map((a) => String(a.pm)).sort()[0];
    const months = monthsToRun(first, last[0]?.p ? String(last[0].p) : null, upTo);
    if (months.length === 0) throw new Stop("Depreciation is already worked out up to that month");

    const charged = new Map(assets.map((a) => [Number(a.id), BigInt(Math.round(Number(a.charged) * 100))]));
    let posted = 0n;
    for (const month of months) {
      let total = 0n;
      const parts: { assetId: number; amount: bigint }[] = [];
      for (const a of assets) {
        // An asset disposed of in this month or before is no longer charged.
        if (a.status === "DISPOSED" && a.dm && monthIndex(String(a.dm)) <= monthIndex(month)) continue;
        const due = depreciationDue(
          { purchaseMonth: String(a.pm), cost: BigInt(Math.round(Number(a.cost) * 100)), salvage: BigInt(Math.round(Number(a.salvage_value) * 100)), lifeMonths: Number(a.life_months), chargedSoFar: charged.get(Number(a.id))! },
          month
        );
        if (due > 0n) { parts.push({ assetId: Number(a.id), amount: due }); total += due; charged.set(Number(a.id), charged.get(Number(a.id))! + due); }
      }
      const [r] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_asset_dep_runs (legal_business_id, division_id, period, total, created_by) VALUES (?, ?, ?, ?, ?)`,
        [businessId, divisionId, month, rupees(total), user.id]
      );
      for (const p of parts) await conn.execute(`INSERT INTO acct_asset_depreciation (run_id, asset_id, amount) VALUES (?, ?, ?)`, [r.insertId, p.assetId, rupees(p.amount)]);
      posted += total;
    }
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, 'ASSET_DEPRECIATION_RUN', 'FIXED_ASSET', 0, ?)`,
      [businessId, user.id, JSON.stringify({ divisionId, months, total: rupees(posted) })]
    );
    return `${PAGE}?saved=${encodeURIComponent(`Depreciation worked out for ${months.length} month${months.length === 1 ? "" : "s"}: ₹${rupees(posted)}. It joins the books when pending entries are posted.`)}`;
  });
}

export async function disposeAssetAction(form: FormData): Promise<void> {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const divisionId = await getActiveDivisionId(user);
  const id = Number(text(form, "asset_id"));
  const kind = text(form, "kind");
  const date = text(form, "disposed_on");
  const proceeds = text(form, "proceeds") === "" ? 0n : paise(text(form, "proceeds"));
  const into = text(form, "into");
  const note = text(form, "note").slice(0, 250);
  const fail = (m: string) => redirect(`${PAGE}?error=${encodeURIComponent(m)}`);
  if (!["SOLD", "SCRAPPED", "GIVEN_AWAY"].includes(kind)) fail("Choose what happened to it");
  if (!validDate(date) || date > todayInIndia()) fail("Check the date");
  if (proceeds < 0n) fail("Check the amount received");
  if (kind !== "SOLD" && proceeds > 0n) fail("Money received is only for an asset that was sold");
  if (proceeds > 0n && !/^(BANK|CASH):\d+$/.test(into)) fail("Choose where the money was received");

  await run(async (conn) => {
    const [rows] = await conn.execute<Row[]>(
      `SELECT id, asset_no, DATE_FORMAT(purchase_date, '%Y-%m-%d') AS pd FROM acct_fixed_assets
        WHERE legal_business_id = ? AND division_id = ? AND id = ? AND status = 'ACTIVE' FOR UPDATE`,
      [businessId, divisionId, id]
    );
    const a = rows[0];
    if (!a) throw new Stop("This asset is not available");
    if (date < String(a.pd)) throw new Stop("The date cannot be before it was bought");
    // Wear up to the month before the disposal must be worked out first, so the books show the right value.
    const [last] = await conn.execute<Row[]>(`SELECT MAX(period) AS p FROM acct_asset_dep_runs WHERE legal_business_id = ? AND division_id = ?`, [businessId, divisionId]);
    const needed = monthIndex(monthOf(date)) - 1;
    if (monthOf(String(a.pd)) < monthOf(date) && (!last[0]?.p || monthIndex(String(last[0].p)) < needed)) {
      throw new Stop("First work out depreciation up to the month before this date, then record the sale or scrap");
    }
    let bankId: number | null = null;
    let cashId: number | null = null;
    if (proceeds > 0n) ({ bankId, cashId } = await pickAccount(conn, businessId, into, "receive"));
    await conn.execute(
      `UPDATE acct_fixed_assets SET status = 'DISPOSED', disposed_on = ?, disposal_kind = ?, proceeds = ?, proceeds_bank_account_id = ?, proceeds_cash_account_id = ?, disposal_note = ? WHERE id = ?`,
      [date, kind, rupees(proceeds), bankId, cashId, note || null, id]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, 'FIXED_ASSET_DISPOSED', 'FIXED_ASSET', ?, ?)`,
      [businessId, user.id, id, JSON.stringify({ assetNo: a.asset_no, kind, date, proceeds: rupees(proceeds) })]
    );
    return `${PAGE}?saved=${encodeURIComponent(`${a.asset_no} removed from the list.`)}`;
  });
}
