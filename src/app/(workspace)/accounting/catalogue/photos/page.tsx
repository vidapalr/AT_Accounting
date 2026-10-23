import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

type Props = { searchParams: Promise<{ done?: string }> };

async function Photos({ searchParams }: Props) {
  const user = await requireAccess("products");
  const { done } = await searchParams;
  const m = done ? /^(\d+)-(\d+)$/.exec(done) : null;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT p.id, p.product_code, p.product_name, p.show_in_shop
       FROM acct_products p
      WHERE p.legal_business_id = ? AND p.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM acct_product_media m
                         WHERE m.legal_business_id = p.legal_business_id AND m.product_id = p.id
                           AND m.status = 'ACTIVE' AND m.media_type = 'IMAGE')
      ORDER BY p.show_in_shop DESC, p.product_name LIMIT 200`,
    [user.legal_business_id]
  );

  const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
  return (
    <div style={{ maxWidth: 800 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/catalogue">← Catalogue</Link></nav>
      <h1>Add photos</h1>
      <p style={{ color: "#475569" }}>
        Choose one photo for each product, then press Save once. Use JPG photos (up to 8 MB each). Try 10 to 15 products at a time.
        Products already on the online shop are listed first.
      </p>
      {m && (
        <p role="status" style={{ color: Number(m[2]) === 0 ? "#166534" : "#b45309" }}>
          {m[1]} photo(s) saved.{Number(m[2]) > 0 ? ` ${m[2]} skipped (not a photo, or over 8 MB).` : ""}
        </p>
      )}
      {rows.length === 0 ? (
        <p>Every product already has a photo. 🎉</p>
      ) : (
        <form action="/api/catalogue/media/bulk" method="post" encType="multipart/form-data">
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={cell}>
                    <strong>{String(r.product_name)}</strong>
                    <div style={{ color: "#64748b", fontSize: 13 }}>{String(r.product_code)}{Number(r.show_in_shop) === 1 ? " · on the shop" : ""}</div>
                  </td>
                  <td style={cell}><input type="file" name={`photo_${r.id}`} accept="image/jpeg,image/png,image/webp" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>Save photos</button></p>
        </form>
      )}
    </div>
  );
}

export default function PhotosPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Photos {...props} /></Suspense>;
}
