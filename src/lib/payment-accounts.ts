import "server-only";

import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

export type PaymentAccount = { value: string; label: string; kind: "CASH" | "BANK" };

/** Cash drawers and business bank accounts that can pay out, as "CASH:id" / "BANK:id" choices. */
export async function paymentAccounts(businessId: number): Promise<PaymentAccount[]> {
  const [cash] = await db.execute<RowDataPacket[]>(
    `SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`,
    [businessId]
  );
  const [banks] = await db.execute<RowDataPacket[]>(
    `SELECT id, bank_name, account_number_last4 FROM acct_bank_accounts
      WHERE legal_business_id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE'
        AND verification_status = 'VERIFIED' AND can_send = 1 ORDER BY bank_name`,
    [businessId]
  );
  return [
    ...cash.map((c) => ({ value: `CASH:${c.id}`, label: `Cash: ${c.cash_name}`, kind: "CASH" as const })),
    ...banks.map((b) => ({ value: `BANK:${b.id}`, label: `Bank: ${b.bank_name}${b.account_number_last4 ? ` ••${b.account_number_last4}` : ""}`, kind: "BANK" as const })),
  ];
}
