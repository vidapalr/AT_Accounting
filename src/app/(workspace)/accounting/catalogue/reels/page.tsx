import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getShopProducts } from "@/lib/shop";
import ReelMaker from "@/components/ReelMaker";

type Props = { searchParams: Promise<{ product?: string }> };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const productId = Number((await searchParams).product);
  if (!Number.isSafeInteger(productId) || productId <= 0) notFound();

  const [prod] = await db.execute<RowDataPacket[]>(
    `SELECT id, product_name FROM acct_products WHERE legal_business_id = ? AND id = ?`, [businessId, productId]);
  if (!prod[0]) notFound();

  const [photos] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_product_media WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE' AND media_type = 'IMAGE'
      ORDER BY is_cover DESC, sort_order, id LIMIT 24`, [businessId, productId]);

  let tracks: RowDataPacket[] = [];
  try {
    [tracks] = await db.execute<RowDataPacket[]>(
      `SELECT id, track_name FROM acct_reel_tracks WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY track_name`, [businessId]);
  } catch { /* migration 073 not run yet: reels still work without music */ }

  let priceText = "";
  try {
    const shop = (await getShopProducts()).find(p => p.id === productId);
    if (shop?.fromPrice) priceText = `From ₹${Math.round(shop.fromPrice).toLocaleString("en-IN")}`;
  } catch { /* price is optional */ }

  return (
    <div style={{ maxWidth: 900 }}>
      <nav style={{ marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Link href={`/accounting/catalogue/${productId}`}>← Photos and videos</Link>
        <Link href="/accounting/catalogue/reels/music">Music for reels</Link>
      </nav>
      <h1>Make a reel: {String(prod[0].product_name)}</h1>
      <p style={{ color: "#475569" }}>A short vertical video from the product photos, with the name, price and music. You see it before anything is posted.</p>
      <ReelMaker
        productId={productId}
        productName={String(prod[0].product_name)}
        priceText={priceText}
        photos={photos.map(p => ({ id: Number(p.id) }))}
        tracks={tracks.map(t => ({ id: Number(t.id), name: String(t.track_name) }))}
      />
    </div>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
