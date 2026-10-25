"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { postDrafts } from "@/lib/ledger/post-drafts";
import { auditorAdjustmentEntry } from "@/lib/ledger/posting-rules";
import { loadChart } from "@/lib/ledger/source-events";

const PAGE = "/accounting/auditor-adjustments";
const SLOTS = 6;
type Row = RowDataPacket & Record<string, string | number | null>;

const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function go(kind: "saved" | "error", message: string): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

/** Records an adjustment the auditor asked for and posts it straight to the ledger. Owner only. */
export async function createAuditorAdjustmentAction(formData: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const text = (n: string) => String(formData.get(n) ?? "").trim();

  const date = text("entry_date");
  const reason = text("reason").slice(0, 300);
  const divisionId = Number(text("adj_division")) || null;
  const branchId = Number(text("adj_branch")) || null;
  if (!validDate(date)) go("error", "Choose the date of the entry.");
  if (reason.length < 5) go("error", "Write the reason the auditor gave (at least a few words).");

  const slots: { accountCode: string; debit: string; credit: string; memo: string }[] = [];
  for (let i = 1; i <= SLOTS; i++) {
    const accountCode = text(`account_${i}`);
    const debit = text(`debit_${i}`).replaceAll(",", "");
    const credit = text(`credit_${i}`).replaceAll(",", "");
    if (!accountCode && !debit && !credit) continue;
    if (!accountCode) go("error", `Line ${i}: choose an account.`);
    if ((debit === "") === (credit === "")) go("error", `Line ${i}: type either a debit or a credit amount.`);
    slots.push({ accountCode, debit, credit, memo: text(`memo_${i}`).slice(0, 300) });
  }
  if (slots.length < 2) go("error", "An entry needs at least two lines.");

  const conn = await db.getConnection();
  try {
    const chart = await loadChart(conn, businessId);
    const lines = slots.map((l, i) => {
      const account = chart.get(l.accountCode);
      if (!account || !account.active || !account.isPosting) throw new Error(`Line ${i + 1}: that account cannot be used.`);
      const wantsDims = account.requiresDivision || account.requiresBranch || account.type === "REVENUE" || account.type === "EXPENSE";
      if (account.requiresDivision && !divisionId) throw new Error(`Line ${i + 1}: ${account.name} needs a division. Choose one above.`);
      if (account.requiresBranch && !branchId) throw new Error(`Line ${i + 1}: ${account.name} needs a branch. Choose one above.`);
      return {
        ...l,
        dims: { divisionId: wantsDims ? divisionId : null, branchId: wantsDims ? branchId : null },
      };
    });

    await conn.beginTransaction();
    const adjustmentNo = await nextCode(conn, {
      table: "acct_auditor_adjustments", column: "adjustment_no", prefix: "ADJ-", width: 4,
      where: "legal_business_id = ?", params: [businessId],
    });
    const [header] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_auditor_adjustments (legal_business_id, adjustment_no, entry_date, reason, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [businessId, adjustmentNo, date, reason, user.id]
    );
    const draft = auditorAdjustmentEntry({ id: header.insertId, adjustmentNo, date, reason, lines });
    const result = await postDrafts(conn, {
      businessId, userId: user.id, drafts: [draft], chart, auditAction: "AUDITOR_ADJUSTMENT_POSTED",
    });
    if (result.posted.length !== 1) throw new Error("The entry could not be posted.");
    await conn.commit();
    revalidatePath(PAGE);
    revalidatePath("/accounting/reports");
    redirect(`${PAGE}?saved=${encodeURIComponent(`${adjustmentNo} posted as ${result.posted[0].journalNo}.`)}`);
  } catch (error) {
    await conn.rollback().catch(() => {});
    // redirect() throws a special error that must pass through
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    let message = error instanceof Error ? error.message : "";
    if (/does not balance/.test(message)) message = "The debits and credits must add up to the same amount.";
    const friendly =
      /must add up|debit or a credit|Line \d|not open|cannot be used|needs a/i.test(message)
        ? message
        : "The entry could not be saved. Nothing was changed.";
    if (friendly.startsWith("The entry could not")) console.error("Auditor adjustment failed:", error);
    go("error", friendly);
  } finally {
    conn.release();
  }
}
