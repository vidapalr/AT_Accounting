/** The public address of the shop, without a trailing slash. Set SHOP_PUBLIC_URL in Hostinger. */
export const shopBaseUrl = () => (process.env.SHOP_PUBLIC_URL || "https://textiles.abhiraminc.com").replace(/\/+$/, "");
