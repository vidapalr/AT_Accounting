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
    `SELECT p.id, p.product_code, p.product_name, p.show_in_shop,
            (SELECT COUNT(*) FROM acct_product_media m
              WHERE m.legal_business_id = p.legal_business_id AND m.product_id = p.id
                AND m.status = 'ACTIVE' AND m.media_type = 'IMAGE') AS photos
       FROM acct_products p
      WHERE p.legal_business_id = ? AND p.status = 'ACTIVE'
      ORDER BY photos > 0, p.show_in_shop DESC, p.product_name LIMIT 300`,
    [user.legal_business_id]
  );

  const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
  return (
    <div style={{ maxWidth: 800 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/catalogue">← Catalogue</Link></nav>
      <h1>Add photos</h1>
      <p style={{ color: "#475569" }}>
        Choose as many photos as you like for each product (hold Ctrl, or Shift, to pick several; up to 12 per product), then press Save once.
        Use JPG, PNG or WebP photos (up to 8 MB each). Try 10 to 15 products at a time. Products without photos are listed first.
        For videos, open the product from the Catalogue.
      </p>
      {m && (
        <p role="status" style={{ color: Number(m[2]) === 0 ? "#166534" : "#b45309" }}>
          {m[1]} photo(s) saved.{Number(m[2]) > 0 ? ` ${m[2]} skipped (not a photo, or over 8 MB).` : ""}
        </p>
      )}
      {rows.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        <form action="/api/catalogue/media/bulk" method="post" encType="multipart/form-data">
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={cell}>
                    <strong>{String(r.product_name)}</strong>
                    <div style={{ color: "#64748b", fontSize: 13 }}>{String(r.product_code)}{Number(r.show_in_shop) === 1 ? " · on the shop" : ""} · {Number(r.photos) === 0 ? "no photos yet" : `${Number(r.photos)} photo${Number(r.photos) === 1 ? "" : "s"} already`}</div>
                  </td>
                  <td style={cell}><input type="file" name={`photo_${r.id}`} multiple accept="image/jpeg,image/png,image/webp" /></td>
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
