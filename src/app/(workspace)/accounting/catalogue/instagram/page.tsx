import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { buildCaption } from "@/lib/instagram-caption";
import InstagramPostKit from "@/components/InstagramPostKit";

type Props = { searchParams: Promise<{ product?: string }> };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const productId = Number((await searchParams).product);
  if (!Number.isSafeInteger(productId) || productId <= 0) notFound();

  const [prod] = await db.execute<RowDataPacket[]>(
    `SELECT id, product_name, fabric, design_name FROM acct_products WHERE legal_business_id = ? AND id = ?`,
    [businessId, productId]
  );
  const p = prod[0];
  if (!p) notFound();

  const [colors] = await db.execute<RowDataPacket[]>(
    `SELECT DISTINCT color_name FROM acct_product_variants
      WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE' AND color_name IS NOT NULL`,
    [businessId, productId]
  );
  const [media] = await db.execute<RowDataPacket[]>(
    `SELECT id, media_type FROM acct_product_media
      WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE'
      ORDER BY is_cover DESC, sort_order, id LIMIT 12`,
    [businessId, productId]
  );

  const caption = buildCaption({
    name: String(p.product_name),
    fabric: p.fabric ? String(p.fabric) : null,
    designName: p.design_name ? String(p.design_name) : null,
    colors: colors.map(c => String(c.color_name)),
  });

  return (
    <div style={{ maxWidth: 900 }}>
      <nav style={{ marginBottom: 12 }}>
        <Link href={`/accounting/catalogue/${productId}`}>← Photos and videos</Link>
      </nav>
      <h1>Post to Instagram: {String(p.product_name)}</h1>
      <p style={{ color: "#475569" }}>Edit the words if you like, then share the photo or video. You tap Post in Instagram.</p>
      <InstagramPostKit
        caption={caption}
        media={media.map(m => ({ id: Number(m.id), type: m.media_type === "VIDEO" ? "VIDEO" : "IMAGE" }))}
      />
    </div>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
