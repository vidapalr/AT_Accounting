"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { normalizePhone } from "@/lib/customer-phone";
import { loadCustomerBills, loadSupplierBills } from "@/lib/party-link";
import { maxSetoff, spreadOldestFirst, totalDue } from "@/lib/setoff-math";

const PAGE = "/accounting/both-sides";
type Row = RowDataPacket & Record<string, string | number | null>;

const isRedirect = (e: unknown) =>
  typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT");

class Stop extends Error {}

function paise(value: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0") : -1n;
}
const rupees = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;

async function audit(conn: PoolConnection, businessId: number, userId: number, action: string, subjectId: number, details: object) {
  await conn.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, ?, 'PARTY_LINK', ?, ?)`,
    [businessId, userId, action, subjectId, JSON.stringify(details)]
  );
}

/** Run `work` in a transaction. A `Stop` becomes a friendly ?error= on the page; anything else is a general failure. */
async function inTransaction(back: string, work: (conn: PoolConnection) => Promise<string>): Promise<never> {
  const conn = await db.getConnection();
  let target = `${back}?error=failed`;
  try {
    await conn.beginTransaction();
    target = await work(conn);
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (isRedirect(error)) throw error;
    if (error instanceof Stop) target = `${back}?error=${encodeURIComponent(error.message)}`;
    else console.error("Party action failed:", error);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/customer-ageing");
  revalidatePath("/accounting/supplier-statement");
  redirect(target);
}

async function lockPair(conn: PoolConnection, businessId: number, supplierId: number, customerId: number) {
  const [s] = await conn.execute<Row[]>(
    `SELECT id, supplier_name, mobile, whatsapp_number, linked_customer_id FROM acct_suppliers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
    [businessId, supplierId]
  );
  const [c] = await conn.execute<Row[]>(
    `SELECT id, full_name, phone, linked_supplier_id FROM acct_customers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
    [businessId, customerId]
  );
  return { supplier: s[0], customer: c[0] };
}

/** Say that this supplier and this customer are the same person. Nothing else changes. */
export async function linkPartiesAction(form: FormData): Promise<void> {
  const user = await requireAccess("both_sides");
  const supplierId = Number(form.get("supplier_id"));
  const customerId = Number(form.get("customer_id"));
  if (!Number.isSafeInteger(supplierId) || supplierId <= 0 || !Number.isSafeInteger(customerId) || customerId <= 0) redirect(`${PAGE}?error=Choose+both+a+supplier+and+a+customer`);

  await inTransaction(PAGE, async (conn) => {
    const { supplier, customer } = await lockPair(conn, user.legal_business_id, supplierId, customerId);
    if (!supplier || !customer) throw new Stop("Could not find that supplier or customer");
    if (supplier.linked_customer_id || customer.linked_supplier_id) throw new Stop("One of them is already linked to someone. Remove that link first");
    await conn.execute(`UPDATE acct_suppliers SET linked_customer_id = ? WHERE legal_business_id = ? AND id = ?`, [customerId, user.legal_business_id, supplierId]);
    await conn.execute(`UPDATE acct_customers SET linked_supplier_id = ? WHERE legal_business_id = ? AND id = ?`, [supplierId, user.legal_business_id, customerId]);
    await audit(conn, user.legal_business_id, user.id, "PARTY_LINKED", supplierId, { supplierId, customerId });
    return `${PAGE}?saved=linked`;
  });
}

/** The supplier also buys from us: add them as a customer (same name and mobile) and link. */
export async function addSupplierAsCustomerAction(form: FormData): Promise<void> {
  const user = await requireAccess("both_sides");
  const businessId = user.legal_business_id;
  const supplierId = Number(form.get("supplier_id"));
  if (!Number.isSafeInteger(supplierId) || supplierId <= 0) redirect(`${PAGE}?error=Choose+a+supplier`);

  await inTransaction(PAGE, async (conn) => {
    const [rows] = await conn.execute<Row[]>(
      `SELECT id, supplier_name, mobile, whatsapp_number, linked_customer_id FROM acct_suppliers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
      [businessId, supplierId]
    );
    const s = rows[0];
    if (!s) throw new Stop("Could not find that supplier");
    if (s.linked_customer_id) throw new Stop("That supplier is already linked");
    const phone = normalizePhone(String(s.mobile ?? "")) ?? normalizePhone(String(s.whatsapp_number ?? ""));
    if (phone) {
      const [dupe] = await conn.execute<Row[]>(`SELECT full_name FROM acct_customers WHERE legal_business_id = ? AND phone = ?`, [businessId, phone]);
      if (dupe[0]) throw new Stop(`A customer with this mobile already exists (${dupe[0].full_name}). Use Link instead`);
    }
    const code = await nextCode(conn, { table: "acct_customers", column: "customer_code", prefix: "CUS-", width: 4, where: "legal_business_id = ?", params: [businessId] });
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_customers (legal_business_id, customer_code, full_name, phone, linked_supplier_id, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [businessId, code, String(s.supplier_name).slice(0, 150), phone, supplierId, user.id]
    );
    await conn.execute(`UPDATE acct_suppliers SET linked_customer_id = ? WHERE legal_business_id = ? AND id = ?`, [ins.insertId, businessId, supplierId]);
    await audit(conn, businessId, user.id, "PARTY_LINKED", supplierId, { supplierId, customerId: ins.insertId, created: "customer" });
    return `${PAGE}?saved=added-customer`;
  });
}

/** The customer also sells to us: add them as a supplier (same name and mobile) and link. */
export async function addCustomerAsSupplierAction(form: FormData): Promise<void> {
  const user = await requireAccess("both_sides");
  const businessId = user.legal_business_id;
  const customerId = Number(form.get("customer_id"));
  if (!Number.isSafeInteger(customerId) || customerId <= 0) redirect(`${PAGE}?error=Choose+a+customer`);

  await inTransaction(PAGE, async (conn) => {
    const [rows] = await conn.execute<Row[]>(
      `SELECT id, full_name, phone, linked_supplier_id FROM acct_customers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
      [businessId, customerId]
    );
    const c = rows[0];
    if (!c) throw new Stop("Could not find that customer");
    if (c.linked_supplier_id) throw new Stop("That customer is already linked");
    const code = await nextCode(conn, { table: "acct_suppliers", column: "supplier_code", prefix: "SUP-", width: 4, where: "legal_business_id = ?", params: [businessId] });
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_suppliers (legal_business_id, supplier_code, supplier_name, supplier_type, mobile, linked_customer_id, created_by)
       VALUES (?, ?, ?, 'OTHER', ?, ?, ?)`,
      [businessId, code, String(c.full_name).slice(0, 180), c.phone, customerId, user.id]
    );
    await conn.execute(`UPDATE acct_customers SET linked_supplier_id = ? WHERE legal_business_id = ? AND id = ?`, [ins.insertId, businessId, customerId]);
    await audit(conn, businessId, user.id, "PARTY_LINKED", ins.insertId, { supplierId: ins.insertId, customerId, created: "supplier" });
    return `${PAGE}?saved=added-supplier`;
  });
}

/** Take the link away again. Records and past set-offs stay exactly as they are. */
export async function unlinkPartiesAction(form: FormData): Promise<void> {
  const user = await requireAccess("both_sides");
  const businessId = user.legal_business_id;
  const supplierId = Number(form.get("supplier_id"));
  if (!Number.isSafeInteger(supplierId) || supplierId <= 0) redirect(PAGE);

  await inTransaction(PAGE, async (conn) => {
    const [rows] = await conn.execute<Row[]>(`SELECT linked_customer_id FROM acct_suppliers WHERE legal_business_id = ? AND id = ? FOR UPDATE`, [businessId, supplierId]);
    const customerId = Number(rows[0]?.linked_customer_id ?? 0);
    await conn.execute(`UPDATE acct_suppliers SET linked_customer_id = NULL WHERE legal_business_id = ? AND id = ?`, [businessId, supplierId]);
    if (customerId) await conn.execute(`UPDATE acct_customers SET linked_supplier_id = NULL WHERE legal_business_id = ? AND id = ?`, [businessId, customerId]);
    await audit(conn, businessId, user.id, "PARTY_UNLINKED", supplierId, { supplierId, customerId });
    return `${PAGE}?saved=unlinked`;
  });
}

/**
 * Cancel an amount they owe us against an amount we owe them. No cash or bank moves.
 * Each side gets a "set-off" payment on the bills it clears (oldest first among the bills
 * ticked), and one set-off record that posts Payables down / Receivables down.
 */
export async function setOffAction(form: FormData): Promise<void> {
  const user = await requireAccess("both_sides");
  const businessId = user.legal_business_id;
  const supplierId = Number(form.get("supplier_id"));
  const back = `${PAGE}/${supplierId}`;
  const amount = paise(String(form.get("amount") ?? ""));
  const date = String(form.get("setoff_date") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 250);
  const saleIds = new Set(form.getAll("sale_id").map(Number));
  const purchaseIds = new Set(form.getAll("purchase_id").map(Number));

  if (!Number.isSafeInteger(supplierId) || supplierId <= 0) redirect(PAGE);
  if (amount <= 0n) redirect(`${back}?error=Enter+the+amount+to+set+off`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect(`${back}?error=Choose+the+date`);
  if (saleIds.size === 0 || purchaseIds.size === 0) redirect(`${back}?error=Tick+at+least+one+bill+on+each+side`);

  await inTransaction(back, async (conn) => {
    const [rows] = await conn.execute<Row[]>(
      `SELECT s.id, s.supplier_name, s.linked_customer_id, c.linked_supplier_id
         FROM acct_suppliers s LEFT JOIN acct_customers c ON c.legal_business_id = s.legal_business_id AND c.id = s.linked_customer_id
        WHERE s.legal_business_id = ? AND s.id = ? FOR UPDATE`,
      [businessId, supplierId]
    );
    const link = rows[0];
    if (!link || !link.linked_customer_id || Number(link.linked_supplier_id) !== supplierId) throw new Stop("This supplier is not linked to a customer");
    const customerId = Number(link.linked_customer_id);

    // Lock and recount at this moment, so two people cannot spend the same bill twice.
    const sales = (await loadCustomerBills(conn, businessId, customerId, true)).filter((b) => saleIds.has(b.id));
    const purchases = (await loadSupplierBills(conn, businessId, supplierId, true)).filter((b) => purchaseIds.has(b.id));
    const most = maxSetoff(totalDue(sales), totalDue(purchases));
    if (amount > most) throw new Stop(`The ticked bills allow at most ₹${rupees(most)} to be set off`);
    const saleShares = spreadOldestFirst(sales, amount);
    const purchaseShares = spreadOldestFirst(purchases, amount);
    if (!saleShares || !purchaseShares) throw new Stop("The ticked bills cannot take that amount");

    const earliest = [...sales, ...purchases].reduce((m, b) => (b.date > m ? b.date : m), "0000-00-00");
    if (date < earliest) throw new Stop("The date cannot be before the latest ticked bill");

    const setoffNo = await nextCode(conn, { table: "acct_party_setoffs", column: "setoff_no", prefix: "SO-", width: 4, where: "legal_business_id = ?", params: [businessId] });
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_party_setoffs (legal_business_id, setoff_no, supplier_id, customer_id, setoff_date, amount, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, setoffNo, supplierId, customerId, date, rupees(amount), note || null, user.id]
    );
    const setoffId = ins.insertId;

    let n = 0;
    for (const share of saleShares) {
      const bill = sales.find((b) => b.id === share.id)!;
      const [pay] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_sales_payments (legal_business_id, division_id, sale_id, payment_date, payment_method, payment_account_type,
                                          bank_account_id, cash_account_id, payment_account, amount, remarks, status, created_by)
         VALUES (?, ?, ?, ?, 'SET_OFF', 'OTHERS', NULL, NULL, NULL, ?, ?, 'RECORDED', ?)`,
        [businessId, bill.divisionId, bill.id, date, rupees(share.amount), `Set off ${setoffNo} against what we owe them`, user.id]
      );
      await conn.execute(`INSERT INTO acct_party_setoff_lines (setoff_id, side, doc_id, payment_id, amount) VALUES (?, 'SALE', ?, ?, ?)`, [setoffId, bill.id, pay.insertId, rupees(share.amount)]);
    }
    for (const share of purchaseShares) {
      const bill = purchases.find((b) => b.id === share.id)!;
      n += 1;
      const [pay] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_purchase_payments (legal_business_id, division_id, purchase_id, payment_no, payment_date, amount, payment_method,
                                             payment_source, funding_treatment, remarks, cutover_treatment, status, created_by, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, 'SET_OFF', 'BUSINESS_BANK', 'NONE', ?, 'POST_CUTOVER', 'VERIFIED', ?, ?, NOW())`,
        [businessId, bill.divisionId, bill.id, `${setoffNo}-${n}`, date, rupees(share.amount), `Set off ${setoffNo} against what they owe us`, user.id, user.id]
      );
      await conn.execute(`INSERT INTO acct_party_setoff_lines (setoff_id, side, doc_id, payment_id, amount) VALUES (?, 'PURCHASE', ?, ?, ?)`, [setoffId, bill.id, pay.insertId, rupees(share.amount)]);
    }

    await audit(conn, businessId, user.id, "PARTY_SETOFF_RECORDED", setoffId, { setoffNo, supplierId, customerId, amount: rupees(amount), note });
    return `${back}?saved=${encodeURIComponent(setoffNo)}`;
  });
}
