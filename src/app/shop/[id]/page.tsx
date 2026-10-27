import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import ProductPicker from "@/components/shop/ProductPicker";
import { getShopMedia, getShopProduct, getShopSettings } from "@/lib/shop";
import styles from "../shop.module.css";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = Number((await params).id);
  const p = Number.isSafeInteger(id) && id > 0 ? await getShopProduct(id) : null;
  return p ? { title: p.name, description: p.description ?? `${p.name} from Abhiram Textiles` } : {};
}

async function Product({ params }: Props) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const product = await getShopProduct(id);
  if (!product) notFound();
  const [media, settings] = await Promise.all([getShopMedia(id), getShopSettings()]);

  return (
    <>
      <p><Link href="/shop" className={styles.muted}>← All products</Link></p>
      <ProductPicker
        product={{ id: product.id, name: product.name, fabric: product.fabric, description: product.description, coverId: product.coverId, variants: product.variants }}
        media={media}
        whatsapp={settings.whatsapp}
      />
    </>
  );
}

export default function ProductPage(props: Props) {
  return <Suspense fallback={<p className={styles.muted}>Loading…</p>}><Product {...props} /></Suspense>;
}
