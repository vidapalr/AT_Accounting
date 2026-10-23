import { NextRequest, NextResponse } from "next/server";

import { getShopProducts } from "@/lib/shop";
import { buildFeedCsv, type FeedItem } from "@/lib/shop-feed";

/**
 * Public product feed for Meta Commerce Manager (WhatsApp Business catalogue and
 * Instagram Shopping). Only products switched on for the shop, with a price and a photo.
 * Set SHOP_PUBLIC_URL (for example https://abhiraminc.com) if the site is served
 * from a different address than the one Meta fetches.
 */
export async function GET(request: NextRequest) {
  const base = (process.env.SHOP_PUBLIC_URL || request.nextUrl.origin).replace(/\/+$/, "");
  const products = await getShopProducts();

  const items: FeedItem[] = [];
  for (const p of products) {
    if (!p.coverId) continue;
    for (const v of p.variants) {
      if (v.price === null || v.price <= 0) continue;
      const detail = [v.size, v.color].filter(Boolean).join(", ");
      items.push({
        sku: v.sku,
        productId: p.id,
        title: detail ? `${p.name} - ${detail}` : p.name,
        description: p.description ?? "",
        available: v.available,
        price: v.price,
        link: `${base}/shop/${p.id}`,
        imageUrl: `${base}/api/shop/media/${p.coverId}`,
        brand: "Abhiram Textiles",
        size: v.size,
        color: v.color,
      });
    }
  }

  return new NextResponse(buildFeedCsv(items), {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=600" },
  });
}
