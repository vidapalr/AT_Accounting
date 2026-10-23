import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getShopMedia, getShopProduct, getShopSettings } from "@/lib/shop";
import { shopOrderLink } from "@/lib/shop-link";

type Props = { params: Promise<{ id: string }> };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

async function Product({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const product = await getShopProduct(id);
  if (!product) notFound();
  const [media, settings] = await Promise.all([getShopMedia(id), getShopSettings()]);

  return (
    <>
      <nav style={{ marginBottom: 12 }}><Link href="/shop">← All products</Link></nav>
      <h1>{product.name}</h1>
      {product.fabric && <p style={{ color: "#64748b" }}>{product.fabric}</p>}
      {product.description && <p>{product.description}</p>}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", margin: "16px 0" }}>
        {media.map(m =>
          m.type === "VIDEO" ? (
            <video key={m.id} src={`/api/shop/media/${m.id}`} controls preload="metadata" playsInline style={{ width: "100%", borderRadius: 10 }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={`/api/shop/media/${m.id}`} alt={product.name} loading="lazy" style={{ width: "100%", borderRadius: 10 }} />
          )
        )}
      </div>

      <h2>Choose</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {product.variants.map(v => {
          const detail = [v.size, v.color].filter(Boolean).join(", ");
          return (
            <div key={v.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#fff" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong>{detail || "Standard"}</strong>
                <div style={{ color: "#64748b" }}>{v.price !== null ? inr(v.price) : "Ask for price"}</div>
              </div>
              {v.available && settings.whatsapp ? (
                <a href={shopOrderLink(settings.whatsapp, [{ product: product.name, detail }])} style={{ background: "#16a34a", color: "#fff", padding: "12px 18px", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
                  Order on WhatsApp
                </a>
              ) : (
                <span style={{ color: "#b91c1c" }}>{v.available ? "Visit the shop to order" : "Out of stock"}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function ProductPage(props: Props) {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <Suspense fallback={<p>Loading…</p>}><Product {...props} /></Suspense>
    </main>
  );
}
