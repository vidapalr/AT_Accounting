import { Suspense } from "react";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { BACKUP_REMINDER_DAYS, lastBackup, lastBackupTriggers, lastFilesBackup } from "@/lib/backup-status";
import { backupTables } from "@/lib/backup-dump";

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };

async function BackupContent() {
  const user = await requireGroupOwner();
  const last = await lastBackup(db, user.legal_business_id);
  const tables = await backupTables(db);
  const triggers = await lastBackupTriggers(db, user.legal_business_id);
  const filesAt = await lastFilesBackup(db, user.legal_business_id);
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
        <p style={{ marginTop: 0 }}>
          Safety rules (posted entries cannot be edited) in the last backup:{" "}
          <strong style={{ color: triggers === null ? "#64748b" : triggers > 0 ? "#166534" : "#b91c1c" }}>
            {triggers === null ? "not recorded yet" : triggers > 0 ? `${triggers} included` : "NOT included"}
          </strong>
          {triggers === 0 && " — your database user may not be allowed to read them. Ask me before relying on this backup."}
        </p>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Documents and photos</h2>
        <p style={{ color: "#64748b" }}>
          The backup above does not hold uploaded agreements, bank proof, product photos or videos. Take this one too.
          Last files backup: <strong>{filesAt ?? "never taken"}</strong>
        </p>
        <a className="btn-link" href="/api/backup/files" style={{ fontSize: 16, padding: "12px 24px", display: "inline-block" }}>
          Download documents and photos
        </a>
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
