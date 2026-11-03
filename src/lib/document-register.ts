import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

export type DocType = "INVOICE" | "ESTIMATE" | "VOUCHER" | "EXPENSE_RECORD";

export const DOC_WORDS: Record<DocType, string> = {
  INVOICE: "Bill",
  ESTIMATE: "Estimate",
  VOUCHER: "Payment voucher",
  EXPENSE_RECORD: "Expense record",
};

/** How many times this paper has already been printed. Zero if the register is not set up yet (migration 058). */
export async function printCount(businessId: number, docType: DocType, sourceId: number): Promise<number> {
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM acct_document_log WHERE legal_business_id = ? AND doc_type = ? AND source_id = ?",
      [businessId, docType, sourceId]
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
