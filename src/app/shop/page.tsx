import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { getShopProducts } from "@/lib/shop";

export const metadata: Metadata = {
  title: "Shop | Abhiram Textiles",
  description: "Browse Abhiram Textiles and order on WhatsApp.",
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

async function Products() {
  const products = await getShopProducts();
  if (products.length === 0) return <p>Our online catalogue is coming soon. Please visit us in the shop.</p>;
  return (
    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
      {products.map(p => (
        <Link key={p.id} href={`/shop/${p.id}`} style={{ textDecoration: "none", color: "inherit", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <div style={{ aspectRatio: "1 / 1", background: "#f1f5f9" }}>
            {p.coverId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/shop/media/${p.coverId}`} alt={p.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </div>
          <div style={{ padding: 12 }}>
            <strong>{p.name}</strong>
            {p.fabric && <div style={{ color: "#64748b", fontSize: 14 }}>{p.fabric}</div>}
            <div style={{ marginTop: 6 }}>
              {p.fromPrice !== null ? <>From {inr(p.fromPrice)}</> : "Ask for price"}
              {!p.available && <span style={{ color: "#b91c1c", marginLeft: 8, fontSize: 14 }}>Out of stock</span>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function ShopPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <nav style={{ marginBottom: 12 }}><Link href="/">← Abhiram Textiles</Link></nav>
      <h1>Shop</h1>
      <p style={{ color: "#475569" }}>Pick what you like and order on WhatsApp. We confirm availability and price.</p>
      <Suspense fallback={<p>Loading…</p>}><Products /></Suspense>
    </main>
  );
}
