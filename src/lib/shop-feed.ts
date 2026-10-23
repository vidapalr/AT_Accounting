/**
 * Product feed for Meta Commerce Manager. Meta reads this file on a schedule and
 * fills the WhatsApp Business catalogue and Instagram Shopping from it.
 * Pure functions, no database.
 */

export type FeedItem = {
  sku: string;
  productId: number;
  title: string;
  description: string;
  available: boolean;
  price: number;
  link: string;
  imageUrl: string;
  brand: string;
  size: string | null;
  color: string | null;
};

const COLUMNS = [
  "id", "item_group_id", "title", "description", "availability", "condition",
  "price", "link", "image_link", "brand", "size", "color",
] as const;

/** One CSV cell: quote it when it has a comma, quote or line break. */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildFeedCsv(items: FeedItem[]): string {
  const rows = items.map(i =>
    [
      i.sku,
      `P${i.productId}`,
      i.title,
      i.description || i.title,
      i.available ? "in stock" : "out of stock",
      "new",
      `${i.price.toFixed(2)} INR`,
      i.link,
      i.imageUrl,
      i.brand,
      i.size ?? "",
      i.color ?? "",
    ].map(csvCell).join(",")
  );
  return [COLUMNS.join(","), ...rows].join("\n") + "\n";
}
