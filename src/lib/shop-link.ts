/** WhatsApp order link for the online shop. No database. */

export function shopOrderLink(phone10: string, lines: { product: string; detail?: string | null }[], shop = "Abhiram Textiles"): string {
  const digits = phone10.replace(/\D/g, "").slice(-10);
  const items = lines.map(l => `• ${l.product}${l.detail ? ` (${l.detail})` : ""}`).join("\n");
  const text = `Hello ${shop}, I would like to order:\n${items}\nPlease confirm availability and price.`;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}
