import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { updateStockEventAction } from "@/lib/catalogue-actions";
import CopyTextButton from "@/components/CopyTextButton";

type Group = {
  productId: number;
  name: string;
  fabric: string;
  coverId: number | null;
  eventIds: number[];
  date: string;
  lines: { label: string; qty: number; unit: string }[];
};

async function NewStock() {
  const user = await requireAccess("products");
  const divisionId = await getActiveDivisionId(user);

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT e.id, e.product_id, e.quantity, DATE_FORMAT(e.created_at, '%Y-%m-%d') AS day,
            p.product_name, p.fabric, v.size_label, v.color_name, v.sku, v.unit_of_measure,
            (SELECT m.id FROM acct_product_media m
              WHERE m.legal_business_id = e.legal_business_id AND m.product_id = e.product_id
                AND m.status = 'ACTIVE' AND m.media_type = 'IMAGE'
              ORDER BY m.is_cover DESC, m.sort_order LIMIT 1) AS cover_id
       FROM acct_stock_events e
       JOIN acct_products p ON p.legal_business_id = e.legal_business_id AND p.id = e.product_id
       JOIN acct_product_variants v ON v.legal_business_id = e.legal_business_id AND v.id = e.variant_id
      WHERE e.legal_business_id = ? AND e.division_id = ? AND e.status = 'NEW'
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 300`,
    [user.legal_business_id, divisionId]
  );

  const map = new Map<number, Group>();
  for (const r of rows) {
    const pid = Number(r.product_id);
    const g = map.get(pid) ?? {
      productId: pid,
      name: String(r.product_name),
      fabric: r.fabric ? String(r.fabric) : "",
      coverId: r.cover_id ? Number(r.cover_id) : null,
      eventIds: [],
      date: String(r.day),
      lines: [],
    };
    g.eventIds.push(Number(r.id));
    g.lines.push({
      label: [r.size_label, r.color_name].filter(Boolean).join(" / ") || String(r.sku),
      qty: Number(r.quantity),
      unit: String(r.unit_of_measure),
    });
    map.set(pid, g);
  }
  const groups = [...map.values()];

  return (
    <div style={{ maxWidth: 1100 }}>
      <nav className="no-print" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <Link href="/accounting/catalogue">← Catalogue</Link>
      </nav>
      <h1>New stock arrivals</h1>
      <p style={{ color: "#475569" }}>
        Every time goods are received, the products appear here so you can tell your customers.
        Copy the message, add the photo, post it, then tap &ldquo;Done&rdquo;.
      </p>

      {groups.length > 1 && (
        <p>
          <Link className="btn-link btn-link-primary" href="/accounting/catalogue/share">
            Send all {groups.length} new arrivals to customers in one message
          </Link>
        </p>
      )}

      {groups.length === 0 && (
        <p style={{ padding: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
          Nothing new. When you receive goods from a supplier, they show up here.
        </p>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {groups.map(g => {
          const text = [
            `New arrival: ${g.name}`,
            g.fabric ? `Fabric: ${g.fabric}` : "",
            ...g.lines.map(l => `• ${l.label}: ${l.qty} ${l.unit}`),
            "Visit Abhiram Textiles or message us to order.",
          ].filter(Boolean).join("\n");
          const ids = g.eventIds.join(",");
          return (
            <div key={g.productId} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
              <div style={{ aspectRatio: "4 / 5", background: "#f1f5f9", borderRadius: 8, overflow: "hidden", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 12, textAlign: "center" }}>
                {g.coverId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/catalogue/media/${g.coverId}`} alt={g.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span>No photo yet</span>
                )}
              </div>
              <div>
                <strong style={{ fontSize: 18 }}>{g.name}</strong>
                <div style={{ color: "#64748b", fontSize: 13 }}>Received {g.date}</div>
                <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
                  {g.lines.map((l, i) => <li key={i}>{l.label}: {l.qty} {l.unit}</li>)}
                </ul>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <CopyTextButton text={text} />
                  <Link className="btn-link btn-link-primary" href={`/accounting/catalogue/share?events=${ids}`}>
                    Send to customers
                  </Link>
                  <Link className="btn-link" href={`/accounting/catalogue/instagram?product=${g.productId}`}>
                    Post to Instagram
                  </Link>
                  <Link className="btn-link" href={`/accounting/catalogue/${g.productId}`}>
                    {g.coverId ? "Photos and videos" : "Add photo"}
                  </Link>
                  <form action={updateStockEventAction}>
                    <input type="hidden" name="event_ids" value={ids} />
                    <input type="hidden" name="status" value="SHARED" />
                    <button type="submit" className="btn-link" style={{ cursor: "pointer" }}>Done, announced</button>
                  </form>
                  <form action={updateStockEventAction}>
                    <input type="hidden" name="event_ids" value={ids} />
                    <input type="hidden" name="status" value="DISMISSED" />
                    <button type="submit" className="btn-link" style={{ cursor: "pointer", color: "#64748b", borderColor: "#cbd5e1" }}>Skip</button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NewStockPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewStock />
    </Suspense>
  );
}
