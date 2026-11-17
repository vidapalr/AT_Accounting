import { NextRequest, NextResponse } from "next/server";

import { getShopProducts } from "@/lib/shop";
import { buildFeedCsv, type FeedItem } from "@/lib/shop-feed";
import { getBrand } from "@/lib/brand";

/**
 * Public product feed for Meta Commerce Manager (WhatsApp Business catalogue and
 * Instagram Shopping). Every product switched on for the shop that has a price. A product with no photo uses the shop logo as its picture.
 * Set SHOP_PUBLIC_URL (for example https://shop.example.com) if the site is served
 * from a different address than the one Meta fetches.
 */
export async function GET(request: NextRequest) {
  const base = (process.env.SHOP_PUBLIC_URL || request.nextUrl.origin).replace(/\/+$/, "");
  const [products, brand] = await Promise.all([getShopProducts(), getBrand()]);

  const items: FeedItem[] = [];
  for (const p of products) {
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
        // Meta needs an image on every row: products without a photo yet show the shop logo until one is added.
        imageUrl: p.coverId ? `${base}/api/shop/media/${p.coverId}` : `${base}${brand.logoLarge}`,
        brand: brand.shopName,
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
