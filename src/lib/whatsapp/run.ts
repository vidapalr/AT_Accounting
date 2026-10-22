import "server-only";

import type { Pool, RowDataPacket } from "mysql2/promise";

import { buildReport, fmtDate } from "./reports";
import { renderPdf } from "./pdf";
import { getProvider, type WhatsAppProvider } from "./provider";
import { JOB_REPORTS, reportPeriod, type Job, type ReportType } from "./core";

type Row = RowDataPacket & Record<string, string | number | null>;

export type RunSummary = { considered: number; sent: number; skipped: number; failed: number; notConnected: number; details: string[] };

const MAX_ATTEMPTS = 2;

type SubscriptionRow = {
  id: number;
  recipientId: number;
  type: ReportType;
  divisionId: number | null;
  branchId: number | null;
  name: string;
  phone: string;
  partyId: number | null;
};

async function loadSubscriptions(db: Pool, businessId: number, types: ReportType[], onlyId?: number): Promise<SubscriptionRow[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT s.id, s.recipient_id, s.report_type, s.division_id, s.branch_id,
            r.full_name, r.phone_e164, r.investor_party_id
     FROM acct_whatsapp_subscriptions s
     JOIN acct_whatsapp_recipients r ON r.id = s.recipient_id AND r.legal_business_id = s.legal_business_id
     WHERE s.legal_business_id = ? AND s.status = 'ACTIVE' AND r.status = 'ACTIVE'
       AND s.report_type IN (${types.map(() => "?").join(",")})${onlyId ? " AND s.id = ?" : ""}
     ORDER BY s.id`,
    onlyId ? [businessId, ...types, onlyId] : [businessId, ...types]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    recipientId: Number(r.recipient_id),
    type: String(r.report_type) as ReportType,
    divisionId: r.division_id === null ? null : Number(r.division_id),
    branchId: r.branch_id === null ? null : Number(r.branch_id),
    name: String(r.full_name),
    phone: String(r.phone_e164),
    partyId: r.investor_party_id === null ? null : Number(r.investor_party_id),
  }));
}

export async function buildFor(db: Pool, businessId: number, sub: SubscriptionRow, today: string) {
  const content = await buildReport({
    db,
    businessId,
    type: sub.type,
    place: { divisionId: sub.divisionId, branchId: sub.branchId },
    today,
    investor: sub.partyId !== null ? { partyId: sub.partyId, name: sub.name } : null,
  });
  const pdf = await renderPdf(content, fmtDate(today));
  const slug = content.title.replace(/[^A-Za-z0-9]+/g, "_");
  return { content, pdf, filename: `Abhiram_${slug}_${reportPeriod(sub.type, today).key}.pdf` };
}

/** Send (or, with send = false, only build) every due report for a job. */
export async function runJob(
  db: Pool,
  businessId: number,
  job: Job,
  today: string,
  options: { provider?: WhatsAppProvider; onlySubscriptionId?: number } = {}
): Promise<RunSummary> {
  const provider = options.provider ?? getProvider();
  const subs = await loadSubscriptions(db, businessId, JOB_REPORTS[job], options.onlySubscriptionId);
  const summary: RunSummary = { considered: subs.length, sent: 0, skipped: 0, failed: 0, notConnected: 0, details: [] };

  for (const sub of subs) {
    const period = reportPeriod(sub.type, today);

    // One message per subscription per period.
    await db.execute(
      `INSERT IGNORE INTO acct_whatsapp_outbox (legal_business_id, subscription_id, recipient_id, report_type, period_key, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [businessId, sub.id, sub.recipientId, sub.type, period.key]
    );
    const [existing] = await db.execute<Row[]>(
      `SELECT id, status, attempts FROM acct_whatsapp_outbox WHERE subscription_id = ? AND period_key = ?`,
      [sub.id, period.key]
    );
    const row = existing[0];
    const outboxId = Number(row.id);
    if (String(row.status) === "SENT" || String(row.status) === "SKIPPED") continue;
    if (Number(row.attempts) >= MAX_ATTEMPTS) continue;

    try {
      const built = await buildFor(db, businessId, sub, today);

      if (built.content.empty) {
        await db.execute(`UPDATE acct_whatsapp_outbox SET status = 'SKIPPED', error_text = 'Nothing to report', headline_json = ? WHERE id = ?`, [JSON.stringify(built.content.params), outboxId]);
        summary.skipped++;
        continue;
      }

      if (!provider.configured) {
        await db.execute(`UPDATE acct_whatsapp_outbox SET status = 'PENDING', error_text = 'WhatsApp is not connected yet', headline_json = ? WHERE id = ?`, [JSON.stringify(built.content.params), outboxId]);
        summary.notConnected++;
        continue;
      }

      await db.execute(`UPDATE acct_whatsapp_outbox SET attempts = attempts + 1 WHERE id = ?`, [outboxId]);
      const result = await provider.send({ to: sub.phone, type: sub.type, params: built.content.params, document: { filename: built.filename, buffer: built.pdf } });
      await db.execute(
        `UPDATE acct_whatsapp_outbox SET status = 'SENT', provider_message_id = ?, error_text = NULL, sent_at = UTC_TIMESTAMP(), headline_json = ? WHERE id = ?`,
        [result.id, JSON.stringify(built.content.params), outboxId]
      );
      summary.sent++;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 480);
      await db.execute(`UPDATE acct_whatsapp_outbox SET status = 'FAILED', error_text = ? WHERE id = ?`, [message, outboxId]);
      summary.failed++;
      summary.details.push(`${sub.name} / ${sub.type}: ${message}`);
    }
  }
  return summary;
}
