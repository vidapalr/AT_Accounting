import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { DOC_WORDS, type DocType } from "@/lib/document-register";

const cell: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };

async function Content() {
  const user = await requireAccess("reports");
  let rows: RowDataPacket[] = [];
  let ready = true;
  try {
    [rows] = await db.execute<RowDataPacket[]>(
      `SELECT l.id, l.doc_type, l.doc_ref, l.event, l.reason, l.copy_id, u.full_name,
              DATE_FORMAT(CONVERT_TZ(l.created_at, '+00:00', '+05:30'), '%d-%m-%Y %H:%i') AS at_text
         FROM acct_document_log l
         LEFT JOIN acct_app_users u ON u.id = l.user_id
        WHERE l.legal_business_id = ?
        ORDER BY l.id DESC LIMIT 300`,
      [user.legal_business_id]
    );
  } catch {
    ready = false;
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1>Printed papers</h1>
      <p style={{ color: "#475569" }}>
        Every bill, estimate, payment voucher and expense record that was printed, who printed it and when.
        A paper printed again shows the reason. Open the saved copy to see the paper exactly as it was printed
        (use Print in the browser and choose Save as PDF if you need a PDF).
      </p>
      {!ready ? (
        <p role="alert">The register is not set up yet. Ask Claude for the database file named 058_document_register.</p>
      ) : rows.length === 0 ? (
        <p>Nothing has been printed since the register started.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["When", "Paper", "Number", "Printed by", "What", "Reason", ""].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td style={cell}>{String(r.at_text)}</td>
                  <td style={cell}>{DOC_WORDS[r.doc_type as DocType] ?? String(r.doc_type)}</td>
                  <td style={cell}>{String(r.doc_ref)}</td>
                  <td style={cell}>{String(r.full_name ?? "")}</td>
                  <td style={{ ...cell, fontWeight: r.event === "REPRINT" ? 700 : 400, color: r.event === "REPRINT" ? "#b45309" : undefined }}>
                    {r.event === "REPRINT" ? "Printed again" : "First print"}
                  </td>
                  <td style={cell}>{r.reason ? String(r.reason) : ""}</td>
                  <td style={cell}>{r.copy_id ? <Link className="btn-link btn-link-small" href={`/accounting/documents/${r.copy_id}`}>Open saved copy</Link> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content />
    </Suspense>
  );
}
