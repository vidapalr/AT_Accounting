/**
 * The public address of the shop, without a trailing slash.
 * Comes from SHOP_PUBLIC_URL on the hosting service, else the first SHOP_HOSTS address; nothing is fixed in code.
 * When neither is set the address is empty and links are written relative to this site ("/shop/12").
 */
export const shopBaseUrl = (): string => {
  const url = (process.env.SHOP_PUBLIC_URL ?? "").trim();
  if (url) return url.replace(/\/+$/, "");
  const host = (process.env.SHOP_HOSTS ?? process.env.TEXTILES_HOST ?? "").split(",")[0].trim();
  return host ? `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : "";
};
