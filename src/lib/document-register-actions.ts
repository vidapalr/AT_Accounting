"use server";

import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { DocType } from "@/lib/document-register";

const TYPES: DocType[] = ["INVOICE", "ESTIMATE", "VOUCHER", "EXPENSE_RECORD"];
const MAX_HTML = 1_500_000;

export type LogPrintResult = { ok: true } | { ok: false; error: string };

/**
 * Called just before a paper is printed. Notes who printed it and keeps a copy of it as it looks now.
 * Printing a paper that was printed before is a reprint and needs a reason.
 * sourceId: invoice/estimate id, expense payment id (voucher) or expense id (expense record).
 */
export async function logPrintAction(input: { docType: string; sourceId: number; docRef: string; reason: string; html: string }): Promise<LogPrintResult> {
  const user = await requireUser();
  const businessId = user.legal_business_id;
  const docType = input.docType as DocType;
  const sourceId = Number(input.sourceId);
  const docRef = String(input.docRef ?? "").slice(0, 80);
  const reason = String(input.reason ?? "").trim().slice(0, 300);
  const html = String(input.html ?? "");
  if (!TYPES.includes(docType) || !Number.isSafeInteger(sourceId) || sourceId <= 0 || !docRef || html.length < 50 || html.length > MAX_HTML) {
    return { ok: false, error: "This paper could not be noted. Nothing was printed." };
  }

  try {
    // The paper must exist in this business.
    const table = docType === "VOUCHER" ? "acct_expense_payments" : docType === "EXPENSE_RECORD" ? "acct_expenses" : "acct_sales_headers";
    const [found] = await db.execute<RowDataPacket[]>(`SELECT id FROM ${table} WHERE legal_business_id = ? AND id = ?`, [businessId, sourceId]);
    if (found.length !== 1) return { ok: false, error: "That paper was not found." };

    const [prev] = await db.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS n FROM acct_document_log WHERE legal_business_id = ? AND doc_type = ? AND source_id = ?",
      [businessId, docType, sourceId]
    );
    const again = Number(prev[0].n) > 0;
    if (again && reason.length < 3) return { ok: false, error: "Write a reason for printing this again." };

    const hash = createHash("sha256").update(html).digest("hex");
    const [same] = await db.execute<RowDataPacket[]>(
      "SELECT id, content_hash FROM acct_document_copies WHERE legal_business_id = ? AND doc_type = ? AND source_id = ? ORDER BY id DESC LIMIT 1",
      [businessId, docType, sourceId]
    );
    let copyId: number;
    if (same.length === 1 && same[0].content_hash === hash) {
      copyId = Number(same[0].id);
    } else {
      const [ins] = await db.execute<import("mysql2/promise").ResultSetHeader>(
        "INSERT INTO acct_document_copies (legal_business_id, doc_type, source_id, doc_ref, content_hash, html, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [businessId, docType, sourceId, docRef, hash, html, user.id]
      );
      copyId = ins.insertId;
    }
    await db.execute(
      "INSERT INTO acct_document_log (legal_business_id, doc_type, source_id, doc_ref, event, reason, copy_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [businessId, docType, sourceId, docRef, again ? "REPRINT" : "PRINT", again ? reason : null, copyId, user.id]
    );
    return { ok: true };
  } catch (error) {
    console.error("Document register failed:", error);
    // Never block a bill from printing because the register is not set up yet.
    return { ok: true };
  }
}
