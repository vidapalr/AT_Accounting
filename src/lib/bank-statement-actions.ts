"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { readStatement } from "@/lib/bank-statement";
import { runMatching } from "@/lib/bank-statement-data";

const PAGE = "/accounting/bank-statement";
const done = (bank: number, kind: "saved" | "error", text: string): never =>
  redirect(`${PAGE}?bank=${bank}&${kind}=${encodeURIComponent(text.slice(0, 250))}`);

export async function importStatementAction(formData: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const bank = Number(formData.get("bank_account_id"));
  if (!Number.isSafeInteger(bank) || bank <= 0) return done(0, "error", "Choose the bank account first.");

  const [acc] = await db.execute<RowDataPacket[]>(
    `SELECT id, gl_account_id FROM acct_bank_accounts WHERE legal_business_id = ? AND id = ?`, [businessId, bank]);
  if (!acc[0]) return done(0, "error", "That bank account was not found.");
  if (!acc[0].gl_account_id) return done(bank, "error", "This bank account has no ledger account yet, so it cannot be matched.");

  const file = formData.get("file");
  let text = String(formData.get("pasted") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 3_000_000) return done(bank, "error", "That file is too big (over 3 MB).");
    text = await file.text();
  }
  if (!text.trim()) return done(bank, "error", "Choose the CSV file from your bank, or paste the lines.");

  const parsed = readStatement(text);
  if (parsed.error) return done(bank, "error", parsed.error);
  if (parsed.lines.length === 0) return done(bank, "error", "No statement lines were found in that file.");

  const seen = new Map<string, number>();
  let added = 0;
  for (const l of parsed.lines) {
    const base = [bank, l.date, l.description, l.moneyOut, l.moneyIn, l.balance ?? ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const hash = createHash("sha1").update(`${base}|${n}`).digest("hex");
    const [r] = await db.execute(
      `INSERT IGNORE INTO acct_bank_statement_lines
         (legal_business_id, bank_account_id, line_date, description, money_out, money_in, balance, line_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, bank, l.date, l.description, l.moneyOut / 100, l.moneyIn / 100, l.balance === null ? null : l.balance / 100, hash, user.id]
    );
    added += Number((r as { affectedRows?: number }).affectedRows ?? 0);
  }
  const matched = await runMatching(db, businessId, bank);
  return done(bank, "saved",
    `${added} new line(s) added${parsed.lines.length - added > 0 ? `, ${parsed.lines.length - added} already uploaded before` : ""}. ${matched} matched with your books.${parsed.skipped ? ` ${parsed.skipped} row(s) skipped.` : ""}`);
}

export async function rematchAction(formData: FormData) {
  const user = await requireGroupOwner();
  const bank = Number(formData.get("bank_account_id"));
  const matched = await runMatching(db, user.legal_business_id, bank);
  return done(bank, "saved", `${matched} more line(s) matched.`);
}

export async function ignoreLineAction(formData: FormData) {
  const user = await requireGroupOwner();
  const bank = Number(formData.get("bank_account_id"));
  const id = Number(formData.get("line_id"));
  const undo = String(formData.get("undo") ?? "") === "1";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (!undo && !note) return done(bank, "error", "Write a short reason for ignoring this line.");
  await db.execute(
    `UPDATE acct_bank_statement_lines SET status = ?, note = ? WHERE legal_business_id = ? AND id = ? AND status <> 'MATCHED'`,
    [undo ? "UNMATCHED" : "IGNORED", undo ? null : note, user.legal_business_id, id]
  );
  return done(bank, "saved", undo ? "Line put back." : "Line ignored.");
}

export async function unmatchLineAction(formData: FormData) {
  const user = await requireGroupOwner();
  const bank = Number(formData.get("bank_account_id"));
  await db.execute(
    `UPDATE acct_bank_statement_lines SET status = 'UNMATCHED', journal_line_id = NULL WHERE legal_business_id = ? AND id = ? AND status = 'MATCHED'`,
    [user.legal_business_id, Number(formData.get("line_id"))]
  );
  return done(bank, "saved", "Match removed.");
}
