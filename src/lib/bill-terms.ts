import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { DEFAULT_TERMS } from "@/lib/bill-terms-text";

type Q = Pool | PoolConnection;

/** The terms now in force. Before migration 066, or if the owner never changed them, the standard two. */
export async function currentTerms(q: Q, businessId: number): Promise<string> {
  try {
    const [r] = await q.execute<RowDataPacket[]>(`SELECT body FROM acct_bill_terms WHERE legal_business_id = ?`, [businessId]);
    const body = String(r[0]?.body ?? "").trim();
    return body || DEFAULT_TERMS;
  } catch {
    return DEFAULT_TERMS;
  }
}

/** The terms kept on this bill when it was made; bills made earlier show the terms now in force. */
export async function termsForSale(q: Q, businessId: number, saleId: number): Promise<string> {
  try {
    const [r] = await q.execute<RowDataPacket[]>(
      `SELECT terms_text FROM acct_sales_headers WHERE legal_business_id = ? AND id = ?`, [businessId, saleId]);
    const kept = String(r[0]?.terms_text ?? "").trim();
    if (kept) return kept;
  } catch { /* column not there yet */ }
  return currentTerms(q, businessId);
}
