import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";

type Props = { searchParams: Promise<{ q?: string; view?: string }> };

async function Catalogue({ searchParams }: Props) {
  const user = await requireAccess("products");
  const divisionId = await getActiveDivisionId(user);
  const { q = "", view = "all" } = await searchParams;
  const search = q.trim().slice(0, 60);
  const like = `%${search.replace(/[%_\\]/g, "")}%`;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT p.id, p.product_code, p.product_name, p.fabric,
            (SELECT m.id FROM acct_product_media m
              WHERE m.legal_business_id = p.legal_business_id AND m.product_id = p.id
                AND m.status = 'ACTIVE' AND m.media_type = 'IMAGE'
              ORDER BY m.is_cover DESC, m.sort_order LIMIT 1) AS cover_id,
            (SELECT COUNT(*) FROM acct_product_media m
              WHERE m.legal_business_id = p.legal_business_id AND m.product_id = p.id
                AND m.status = 'ACTIVE' AND m.media_type = 'IMAGE') AS photos,
            (SELECT COUNT(*) FROM acct_product_media m
              WHERE m.legal_business_id = p.legal_business_id AND m.product_id = p.id
                AND m.status = 'ACTIVE' AND m.media_type = 'VIDEO') AS videos,
            (SELECT COALESCE(SUM(sm.quantity_change), 0)
               FROM acct_stock_movements sm
               JOIN acct_product_variants v ON v.id = sm.variant_id
                AND v.legal_business_id = sm.legal_business_id
              WHERE v.product_id = p.id AND sm.legal_business_id = p.legal_business_id) AS in_stock
       FROM acct_products p
      WHERE p.legal_business_id = ? AND p.division_id = ? AND p.status = 'ACTIVE'
        AND (p.product_name LIKE ? OR p.product_code LIKE ?)
      ORDER BY p.product_name
      LIMIT 400`,
    [user.legal_business_id, divisionId, like, like]
  );

  const all = rows.map(r => ({
    id: Number(r.id),
    code: String(r.product_code),
    name: String(r.product_name),
    fabric: r.fabric ? String(r.fabric) : "",
    coverId: r.cover_id ? Number(r.cover_id) : null,
    photos: Number(r.photos),
    videos: Number(r.videos),
    inStock: Number(r.in_stock),
  }));
  const products = view === "missing" ? all.filter(p => p.photos === 0) : all;
  const missing = all.filter(p => p.photos === 0).length;

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1>Catalogue</h1>
      <p style={{ color: "#475569" }}>
        Photos and short videos of every product, kept once and used everywhere: messages to customers,
        social posts and the online shop later.
      </p>

      <div className="no-print" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "12px 0 18px" }}>
        <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input name="q" defaultValue={search} placeholder="Search products" style={{ padding: 10, minWidth: 220, border: "1px solid #cbd5e1", borderRadius: 8 }} />
          <select name="view" defaultValue={view} style={{ padding: 10, borderRadius: 8 }}>
            <option value="all">All products ({all.length})</option>
            <option value="missing">Without a photo ({missing})</option>
          </select>
          <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer" }}>Search</button>
        </form>
        <Link className="btn-link" href="/accounting/catalogue/new-stock">New stock arrivals</Link>
      </div>

      {products.length === 0 && <p>No products found.</p>}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
        {products.map(p => (
          <Link
            key={p.id}
            href={`/accounting/catalogue/${p.id}`}
            style={{ textDecoration: "none", color: "inherit", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", display: "block" }}
          >
            <div style={{ aspectRatio: "4 / 5", background: "#f1f5f9", display: "grid", placeItems: "center", color: "#94a3b8" }}>
              {p.coverId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/catalogue/media/${p.coverId}`} alt={p.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span>No photo yet</span>
              )}
            </div>
            <div style={{ padding: 12 }}>
              <strong>{p.name}</strong>
              <div style={{ color: "#64748b", fontSize: 13 }}>{p.code}{p.fabric ? ` · ${p.fabric}` : ""}</div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                In stock: <strong>{p.inStock}</strong> · {p.photos} photo{p.photos === 1 ? "" : "s"} · {p.videos} video{p.videos === 1 ? "" : "s"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function CataloguePage(props: Props) {
  return (
    <Suspense fallback={<p>Loading catalogue…</p>}>
      <Catalogue {...props} />
    </Suspense>
  );
}
