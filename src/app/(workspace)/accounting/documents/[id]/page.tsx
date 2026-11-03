import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("reports");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT doc_ref, html, DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%d-%m-%Y %H:%i') AS at_text
       FROM acct_document_copies WHERE legal_business_id = ? AND id = ?`,
    [user.legal_business_id, id]
  );
  if (rows.length !== 1) notFound();
  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: 24 }}>
      <Link className="btn-link" href="/accounting/documents">← Printed papers</Link>
      <h1>Saved copy: {String(rows[0].doc_ref)}</h1>
      <p style={{ color: "#475569" }}>The paper as it was printed on {String(rows[0].at_text)}. It cannot be changed.</p>
      {/* No scripts can run inside this frame, so the stored paper can only be looked at. */}
      <iframe title="Saved copy" sandbox="" srcDoc={String(rows[0].html)} style={{ width: "100%", height: 1100, border: "1px solid #cbd5e1", background: "#fff" }} />
    </main>
  );
}

export default function SavedCopyPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
