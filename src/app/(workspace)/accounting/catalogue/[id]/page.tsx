import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { setCoverAction, removeMediaAction } from "@/lib/catalogue-actions";
import CopyTextButton from "@/components/CopyTextButton";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ upload?: string }>;
};

function uploadMessage(code?: string): { ok: boolean; text: string } | null {
  if (!code) return null;
  if (code === "none") return { ok: false, text: "Choose at least one photo or video first." };
  if (code === "toomany") return { ok: false, text: "Please upload up to 12 files at a time." };
  const m = /^(\d+)-(\d+)$/.exec(code);
  if (!m) return null;
  const saved = Number(m[1]);
  const skipped = Number(m[2]);
  return {
    ok: skipped === 0,
    text:
      `${saved} file(s) saved.` +
      (skipped ? ` ${skipped} skipped: only JPG, PNG, WebP photos (up to 8 MB) and MP4, MOV, WebM videos (up to 60 MB) are accepted.` : ""),
  };
}

async function ProductMedia({ params, searchParams }: Props) {
  const user = await requireAccess("products");
  const { id } = await params;
  const { upload } = await searchParams;
  const productId = Number(id);
  if (!Number.isSafeInteger(productId) || productId <= 0) notFound();
  const businessId = user.legal_business_id;

  const [prod] = await db.execute<RowDataPacket[]>(
    `SELECT id, product_code, product_name, brand_name, fabric, design_name, description
       FROM acct_products WHERE legal_business_id = ? AND id = ?`,
    [businessId, productId]
  );
  const p = prod[0];
  if (!p) notFound();

  const [media] = await db.execute<RowDataPacket[]>(
    `SELECT id, media_type, original_name, size_bytes, is_cover
       FROM acct_product_media
      WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE'
      ORDER BY is_cover DESC, sort_order, id`,
    [businessId, productId]
  );

  const [variants] = await db.execute<RowDataPacket[]>(
    `SELECT v.id, v.sku, v.barcode, v.size_label, v.color_name, v.unit_of_measure,
            (SELECT COALESCE(SUM(sm.quantity_change), 0) FROM acct_stock_movements sm
              WHERE sm.legal_business_id = v.legal_business_id AND sm.variant_id = v.id) AS in_stock
       FROM acct_product_variants v
      WHERE v.legal_business_id = ? AND v.product_id = ? AND v.status = 'ACTIVE'
      ORDER BY v.id`,
    [businessId, productId]
  );

  const msg = uploadMessage(upload);
  const sizes = [...new Set(variants.map(v => String(v.size_label ?? "")).filter(Boolean))];
  const colours = [...new Set(variants.map(v => String(v.color_name ?? "")).filter(Boolean))];
  const text = [
    `New arrival: ${p.product_name}`,
    p.fabric ? `Fabric: ${p.fabric}` : "",
    sizes.length ? `Sizes: ${sizes.join(", ")}` : "",
    colours.length ? `Colours: ${colours.join(", ")}` : "",
    "Visit Abhiram Textiles or message us to order.",
  ].filter(Boolean).join("\n");

  return (
    <div style={{ maxWidth: 1100 }}>
      <nav className="no-print" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Link href="/accounting/catalogue">← Catalogue</Link>
        <Link href="/accounting/products">Edit product details</Link>
      </nav>

      <h1 style={{ marginBottom: 4 }}>{String(p.product_name)}</h1>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        {String(p.product_code)}{p.fabric ? ` · ${p.fabric}` : ""}{p.brand_name ? ` · ${p.brand_name}` : ""}
      </p>

      {msg && <p role="status" style={{ color: msg.ok ? "#166534" : "#b91c1c" }}>{msg.text}</p>}

      <section style={{ padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Add photos and videos</h2>
        <form action="/api/catalogue/media" method="post" encType="multipart/form-data" style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="product_id" value={String(p.id)} />
          <input
            type="file"
            name="files"
            multiple
            required
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            style={{ padding: 10, border: "1px dashed #94a3b8", borderRadius: 10, background: "#f8fafc" }}
          />
          <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", justifySelf: "start" }}>
            Upload
          </button>
          <small style={{ color: "#64748b" }}>
            Photos: JPG, PNG or WebP up to 8 MB. Videos: MP4, MOV or WebM up to 60 MB. Up to 12 files at a time.
            The first photo becomes the cover.
          </small>
        </form>
      </section>

      <h2>Gallery ({media.length})</h2>
      {media.length === 0 && <p>No photos or videos yet.</p>}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {media.map(m => (
          <div key={String(m.id)} style={{ background: "#fff", border: `2px solid ${m.is_cover ? "#2f6fed" : "#e2e8f0"}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ aspectRatio: "4 / 5", background: "#0f172a", display: "grid", placeItems: "center" }}>
              {m.media_type === "VIDEO" ? (
                <video src={`/api/catalogue/media/${m.id}`} controls preload="metadata" playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/catalogue/media/${m.id}`} alt={String(m.original_name ?? "photo")} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
            </div>
            <div style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {m.is_cover ? <strong style={{ color: "#2f6fed" }}>Cover photo</strong> : null}
              {m.media_type === "IMAGE" && !m.is_cover && (
                <form action={setCoverAction}>
                  <input type="hidden" name="media_id" value={String(m.id)} />
                  <input type="hidden" name="product_id" value={String(p.id)} />
                  <button type="submit" className="btn-link btn-link-small" style={{ cursor: "pointer" }}>Make cover</button>
                </form>
              )}
              <form action={removeMediaAction}>
                <input type="hidden" name="media_id" value={String(m.id)} />
                <input type="hidden" name="product_id" value={String(p.id)} />
                <button type="submit" className="btn-link btn-link-small" style={{ cursor: "pointer", borderColor: "#fca5a5", color: "#b91c1c" }}>Remove</button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 28 }}>Sizes, colours and stock</h2>
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>{["SKU", "Size", "Colour", "Barcode", "In stock"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {variants.map(v => (
              <tr key={String(v.id)}>
                <td style={{ padding: "10px 12px" }}>{String(v.sku)}</td>
                <td style={{ padding: "10px 12px" }}>{String(v.size_label ?? "—")}</td>
                <td style={{ padding: "10px 12px" }}>{String(v.color_name ?? "—")}</td>
                <td style={{ padding: "10px 12px" }}>{String(v.barcode ?? "—")}</td>
                <td style={{ padding: "10px 12px" }}>{Number(v.in_stock)} {String(v.unit_of_measure)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={{ marginTop: 24, padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Message for WhatsApp or Instagram</h2>
        <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", padding: 12, borderRadius: 8, margin: "0 0 12px" }}>{text}</pre>
        <CopyTextButton text={text} />
        <p style={{ color: "#64748b", marginBottom: 0 }}>Copy the message, then add the cover photo or a video from this page.</p>
      </section>
    </div>
  );
}

export default function ProductMediaPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading product…</p>}>
      <ProductMedia {...props} />
    </Suspense>
  );
}
