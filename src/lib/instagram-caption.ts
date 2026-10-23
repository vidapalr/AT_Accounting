/** Builds a ready-to-post Instagram caption from product details. No database. */

export type CaptionInput = {
  name: string;
  fabric?: string | null;
  designName?: string | null;
  colors?: string[];
  shop?: string;
};

const clean = (v: string | null | undefined) => String(v ?? "").trim();

/** "Cotton Saree" -> "CottonSaree". Letters and digits only, as Instagram requires. */
export function toHashtag(text: string): string | null {
  const words = clean(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 0) return null;
  const tag = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  return tag.length > 40 ? null : `#${tag}`;
}

export function buildCaption(input: CaptionInput): string {
  const shop = clean(input.shop) || "Abhiram Textiles";
  const name = clean(input.name);
  const fabric = clean(input.fabric);
  const design = clean(input.designName);
  const colors = [...new Set((input.colors ?? []).map(clean).filter(Boolean))].slice(0, 6);

  const lines = [`New at ${shop} ✨`, "", name];
  if (fabric) lines.push(`Fabric: ${fabric}`);
  if (design) lines.push(`Design: ${design}`);
  if (colors.length) lines.push(`Colours: ${colors.join(", ")}`);
  lines.push("", "Visit us or message us on WhatsApp to order.");

  const tags = [
    ...new Set(
      [toHashtag(shop), toHashtag(name), toHashtag(fabric), toHashtag(design), "#NewArrivals", "#Fashion", "#Textiles"]
        .filter((t): t is string => t !== null)
    ),
  ].slice(0, 12);

  const caption = `${lines.join("\n")}\n\n${tags.join(" ")}`;
  return caption.length > 2200 ? caption.slice(0, 2200) : caption;
}
