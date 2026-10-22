"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { todayInIndia } from "@/lib/reports/money";
import { runJob } from "@/lib/whatsapp/run";
import { REPORT_TYPES, normalizePhone, parseScope, reportPeriod, type Job, type ReportType } from "@/lib/whatsapp/core";

const PAGE = "/accounting/whatsapp";

class UserError extends Error {}

function back(kind: "done" | "error", message: string): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function run(action: () => Promise<string>, failure: string): Promise<never> {
  let message: string;
  try {
    message = await action();
  } catch (error) {
    if (error instanceof UserError) back("error", error.message);
    console.error(failure, error);
    back("error", failure);
  }
  revalidatePath(PAGE);
  back("done", message);
}

export async function addRecipientAction(form: FormData) {
  const owner = await requireGroupOwner();
  await run(async () => {
    const name = text(form, "full_name");
    const phone = normalizePhone(text(form, "phone"));
    const partyText = text(form, "investor_party_id");
    if (name.length < 2 || name.length > 160) throw new UserError("Enter the person's name.");
    if (!phone) throw new UserError("That phone number does not look right. Use the 10-digit mobile number, or +country code for abroad.");

    let partyId: number | null = null;
    if (partyText) {
      partyId = Number(partyText);
      const [p] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_funding_parties WHERE legal_business_id = ? AND id = ?`, [owner.legal_business_id, partyId]);
      if (p.length !== 1) throw new UserError("Choose an investor from the list.");
    }

    const [dup] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_whatsapp_recipients WHERE legal_business_id = ? AND phone_e164 = ?`, [owner.legal_business_id, phone]);
    if (dup.length > 0) throw new UserError("That number is already on the list.");

    await db.execute<ResultSetHeader>(
      `INSERT INTO acct_whatsapp_recipients (legal_business_id, full_name, phone_e164, investor_party_id, created_by) VALUES (?, ?, ?, ?, ?)`,
      [owner.legal_business_id, name, phone, partyId, owner.id]
    );
    return `${name} added. Now choose which reports they should get.`;
  }, "The person could not be added.");
}

export async function addSubscriptionAction(form: FormData) {
  const owner = await requireGroupOwner();
  await run(async () => {
    const recipientId = Number(form.get("recipient_id"));
    const type = text(form, "report_type") as ReportType;
    const scope = parseScope(text(form, "scope"));
    if (!REPORT_TYPES.includes(type)) throw new UserError("Choose a report.");
    if (!scope) throw new UserError("Choose group, division or branch.");

    const [rec] = await db.execute<RowDataPacket[]>(`SELECT id, investor_party_id FROM acct_whatsapp_recipients WHERE legal_business_id = ? AND id = ?`, [owner.legal_business_id, recipientId]);
    if (rec.length !== 1) throw new UserError("That person was not found.");
    if (type === "INVESTOR_STATEMENT" && rec[0].investor_party_id === null) {
      throw new UserError("Link this person to an investor first. Statements are built for one investor.");
    }

    let divisionId = scope.divisionId;
    let branchId = scope.branchId;
    if (type === "INVESTOR_STATEMENT") {
      divisionId = null;
      branchId = null;
    } else if (branchId !== null) {
      const [b] = await db.execute<RowDataPacket[]>(`SELECT division_id FROM acct_branches WHERE legal_business_id = ? AND id = ?`, [owner.legal_business_id, branchId]);
      if (b.length !== 1) throw new UserError("That branch was not found.");
      divisionId = Number(b[0].division_id);
    } else if (divisionId !== null) {
      const [d] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_divisions WHERE legal_business_id = ? AND id = ?`, [owner.legal_business_id, divisionId]);
      if (d.length !== 1) throw new UserError("That division was not found.");
    }

    const [dup] = await db.execute<RowDataPacket[]>(
      `SELECT id FROM acct_whatsapp_subscriptions WHERE recipient_id = ? AND report_type = ? AND division_id <=> ? AND branch_id <=> ?`,
      [recipientId, type, divisionId, branchId]
    );
    if (dup.length > 0) throw new UserError("They already get that report for that place.");

    await db.execute(
      `INSERT INTO acct_whatsapp_subscriptions (legal_business_id, recipient_id, report_type, division_id, branch_id) VALUES (?, ?, ?, ?, ?)`,
      [owner.legal_business_id, recipientId, type, divisionId, branchId]
    );
    return "Report added.";
  }, "The report could not be added.");
}

export async function setRecipientStatusAction(form: FormData) {
  const owner = await requireGroupOwner();
  await run(async () => {
    const status = text(form, "status") === "PAUSED" ? "PAUSED" : "ACTIVE";
    await db.execute(`UPDATE acct_whatsapp_recipients SET status = ? WHERE legal_business_id = ? AND id = ?`, [status, owner.legal_business_id, Number(form.get("recipient_id"))]);
    return status === "PAUSED" ? "Paused. They will not receive anything until you resume." : "Resumed.";
  }, "The change could not be saved.");
}

export async function setSubscriptionStatusAction(form: FormData) {
  const owner = await requireGroupOwner();
  await run(async () => {
    const status = text(form, "status") === "PAUSED" ? "PAUSED" : "ACTIVE";
    await db.execute(`UPDATE acct_whatsapp_subscriptions SET status = ? WHERE legal_business_id = ? AND id = ?`, [status, owner.legal_business_id, Number(form.get("subscription_id"))]);
    return status === "PAUSED" ? "Report paused." : "Report resumed.";
  }, "The change could not be saved.");
}

export async function removeSubscriptionAction(form: FormData) {
  const owner = await requireGroupOwner();
  await run(async () => {
    await db.execute(`DELETE FROM acct_whatsapp_subscriptions WHERE legal_business_id = ? AND id = ?`, [owner.legal_business_id, Number(form.get("subscription_id"))]);
    return "Report removed.";
  }, "The report could not be removed.");
}

export async function removeRecipientAction(form: FormData) {
  const owner = await requireGroupOwner();
  await run(async () => {
    await db.execute(`DELETE FROM acct_whatsapp_recipients WHERE legal_business_id = ? AND id = ?`, [owner.legal_business_id, Number(form.get("recipient_id"))]);
    return "Person removed along with their reports. Past messages stay in the log.";
  }, "The person could not be removed.");
}

const JOB_OF: Record<ReportType, Job> = {
  DAILY_SALES: "daily",
  DAILY_FULL: "daily",
  STOCK_DAILY: "daily",
  ALERTS: "morning",
  STOCK_MONTHLY: "monthly",
  INVESTOR_STATEMENT: "monthly",
};

/** Owner presses "Send now": sends this one report for today, even if it was sent already. */
export async function sendNowAction(form: FormData) {
  const owner = await requireGroupOwner();
  await run(async () => {
    const id = Number(form.get("subscription_id"));
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT report_type FROM acct_whatsapp_subscriptions WHERE legal_business_id = ? AND id = ?`, [owner.legal_business_id, id]);
    if (rows.length !== 1) throw new UserError("That report was not found.");
    const type = String(rows[0].report_type) as ReportType;
    const today = todayInIndia();
    await db.execute(`DELETE FROM acct_whatsapp_outbox WHERE subscription_id = ? AND period_key = ?`, [id, reportPeriod(type, today).key]);
    const result = await runJob(db, owner.legal_business_id, JOB_OF[type], today, { onlySubscriptionId: id });
    if (result.notConnected > 0) throw new UserError("WhatsApp is not connected yet, so nothing was sent. Use Preview to see the report.");
    if (result.failed > 0) throw new UserError(result.details[0] ?? "Sending failed. See the message log below.");
    if (result.skipped > 0) return "Nothing to report right now, so no message was sent.";
    return "Sent. It should reach their WhatsApp in a moment.";
  }, "Sending failed. See the message log below.");
}

/** Try again for everything that failed today. */
export async function retryFailedAction() {
  const owner = await requireGroupOwner();
  await run(async () => {
    const today = todayInIndia();
    let sent = 0;
    for (const job of ["daily", "morning", "monthly"] as Job[]) {
      sent += (await runJob(db, owner.legal_business_id, job, today)).sent;
    }
    return sent > 0 ? `${sent} message(s) sent.` : "Nothing was waiting to be sent.";
  }, "Retry failed.");
}
