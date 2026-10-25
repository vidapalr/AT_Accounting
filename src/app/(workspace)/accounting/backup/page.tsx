import { Suspense } from "react";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { BACKUP_REMINDER_DAYS, lastBackup } from "@/lib/backup-status";
import { backupTables } from "@/lib/backup-dump";

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };

async function BackupContent() {
  const user = await requireGroupOwner();
  const last = await lastBackup(db, user.legal_business_id);
  const tables = await backupTables(db);
  const stale = last.days === null || last.days >= BACKUP_REMINDER_DAYS;

  return (
    <main style={{ padding: 24, maxWidth: 760 }}>
      <h1>Backup</h1>
      <p style={{ color: "#64748b" }}>
        A full copy of all your accounting data ({tables.length} tables), saved on your own computer. Take one every week, and before any big change.
      </p>

      <section style={{ ...box, borderColor: stale ? "#f59e0b" : "#e2e8f0" }}>
        <p>
          Last backup:{" "}
          <strong>{last.atText ? `${last.atText} (${last.days === 0 ? "today" : `${last.days} day${last.days === 1 ? "" : "s"} ago`})` : "never taken"}</strong>
        </p>
        <a className="btn-link btn-link-primary" href="/api/backup" style={{ fontSize: 16, padding: "12px 24px", display: "inline-block" }}>
          Download a backup now
        </a>
        <p style={{ color: "#64748b", marginTop: 10 }}>
          It may take a minute. Keep the file somewhere private (like your email or a USB drive): it holds your business data and the sign-in details of your users.
        </p>
      </section>

      <section style={box}>
        <h2>If you ever need to restore</h2>
        <ol>
          <li>Open phpMyAdmin and choose your accounting database.</li>
          <li>Press <strong>Import</strong>, choose the backup file (it can stay zipped as .sql.gz), and press Go.</li>
          <li>This replaces the current accounting data with the data in the file, so do it only when something has gone badly wrong, and ask me first.</li>
        </ol>
        <p style={{ color: "#64748b" }}>Also check in Hostinger whether automatic website backups are switched on. They are a second safety net.</p>
      </section>
    </main>
  );
}

export default function BackupPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <BackupContent />
    </Suspense>
  );
}
