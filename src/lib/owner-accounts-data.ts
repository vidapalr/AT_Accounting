import "server-only";
import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

type Q = Pool | PoolConnection;

export type OwnerLine = { date: string; label: string; amount: bigint; direction: "IN" | "OUT" };
export type OwnerAccountView = {
  id: number;
  name: string;
  note: string | null;
  lines: OwnerLine[];
  moneyIn: bigint;
  moneyOut: bigint;
  /** Business money the owner is holding (positive), or what the business owes the owner (negative). */
  balance: bigint;
};

export type OwnerAccountsResult = {
  ready: boolean;
  accounts: OwnerAccountView[];
  /** Business costs paid from "owner's own money" that were not tied to an owner account. */
  untaggedPaid: bigint;
};

export function netBalance(lines: OwnerLine[]): { moneyIn: bigint; moneyOut: bigint; balance: bigint } {
  let moneyIn = 0n;
  let moneyOut = 0n;
  for (const l of lines) {
    if (l.direction === "IN") moneyIn += l.amount;
    else moneyOut += l.amount;
  }
  return { moneyIn, moneyOut, balance: moneyIn - moneyOut };
}

/** Owner accounts with their movements. `ready` is false until migration 076 has been run. */
export async function loadOwnerAccounts(db: Q, businessId: number): Promise<OwnerAccountsResult> {
  let rows: RowDataPacket[];
  try {
    [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, account_name, note FROM acct_owner_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY account_name`,
      [businessId]
    );
  } catch {
    return { ready: false, accounts: [], untaggedPaid: 0n };
  }

  const byId = new Map<number, OwnerLine[]>();
  for (const r of rows) byId.set(Number(r.id), []);

  const pull = async (sql: string, direction: "IN" | "OUT", label: (r: RowDataPacket) => string) => {
    try {
      const [found] = await db.execute<RowDataPacket[]>(sql, [businessId]);
      for (const r of found) {
        byId.get(Number(r.oid))?.push({ date: String(r.d), label: label(r), amount: BigInt(r.paise), direction });
      }
    } catch { /* a source table or column is not there yet */ }
  };

  await pull(
    `SELECT c.taken_owner_account_id AS oid, DATE_FORMAT(c.closing_date, '%Y-%m-%d') AS d, ROUND(c.taken_out * 100) AS paise, a.cash_name
       FROM acct_cash_closings c JOIN acct_cash_accounts a ON a.id = c.cash_account_id
      WHERE c.legal_business_id = ? AND c.taken_owner_account_id IS NOT NULL AND c.taken_to = 'OWNER' AND c.taken_out > 0`,
    "IN", (r) => `Cash taken from ${String(r.cash_name)} at closing`
  );
  await pull(
    `SELECT owner_account_id AS oid, DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise, entry_no
       FROM acct_owner_money WHERE legal_business_id = ? AND owner_account_id IS NOT NULL AND direction = 'OUT'`,
    "IN", (r) => `Taken out of a business account (${String(r.entry_no)})`
  );
  await pull(
    `SELECT owner_account_id AS oid, DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise, entry_no
       FROM acct_owner_money WHERE legal_business_id = ? AND owner_account_id IS NOT NULL AND direction = 'IN'`,
    "OUT", (r) => `Put into the business (${String(r.entry_no)})`
  );
  await pull(
    `SELECT p.owner_account_id AS oid, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, ROUND(p.amount * 100) AS paise, e.description
       FROM acct_expense_payments p JOIN acct_expenses e ON e.id = p.expense_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.owner_account_id IS NOT NULL AND p.payment_source = 'OWNER_PERSONAL' AND p.status = 'RECORDED'`,
    "OUT", (r) => `Business cost paid: ${String(r.description).slice(0, 60)}`
  );
  await pull(
    `SELECT p.owner_account_id AS oid, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, ROUND(p.amount * 100) AS paise, p.payment_no
       FROM acct_purchase_payments p
      WHERE p.legal_business_id = ? AND p.owner_account_id IS NOT NULL AND p.payment_source = 'OWNER_PERSONAL' AND p.status IN ('DRAFT','VERIFIED')`,
    "OUT", (r) => `Paid to a supplier (${String(r.payment_no)})`
  );

  let untaggedPaid = 0n;
  for (const sql of [
    `SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS paise FROM acct_expense_payments
      WHERE legal_business_id = ? AND payment_source = 'OWNER_PERSONAL' AND status = 'RECORDED' AND owner_account_id IS NULL`,
    `SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS paise FROM acct_purchase_payments
      WHERE legal_business_id = ? AND payment_source = 'OWNER_PERSONAL' AND status IN ('DRAFT','VERIFIED') AND owner_account_id IS NULL`,
  ]) {
    try {
      const [r] = await db.execute<RowDataPacket[]>(sql, [businessId]);
      untaggedPaid += BigInt(r[0]?.paise ?? 0);
    } catch { /* ignore */ }
  }

  const accounts: OwnerAccountView[] = rows.map((r) => {
    const lines = (byId.get(Number(r.id)) ?? []).sort((a, b) => b.date.localeCompare(a.date));
    return { id: Number(r.id), name: String(r.account_name), note: r.note ? String(r.note) : null, lines, ...netBalance(lines) };
  });
  return { ready: true, accounts, untaggedPaid };
}
