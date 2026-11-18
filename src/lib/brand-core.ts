/**
 * The words, numbers and pictures a company prints on bills, letters, the website and messages.
 * Nothing here is fixed in code: every value comes from the business record and its settings
 * (Set-up > Group details > Brand). Pure, so it can be tested and used in the browser.
 */

export type Brand = {
  /** The group or legal name, e.g. "Acme Group". */
  groupName: string;
  /** The name customers see (shop, bills, website), e.g. "Acme Textiles". */
  shopName: string;
  tagline: string;
  /** Town or area shown on bills and the website. */
  place: string;
  /** One or two sentences about the shop for the website. */
  description: string;
  /** Printed under the name on bills, e.g. "An Acme Group company". */
  parentLine: string;
  watermark: string;
  shopPhone: string;
  /** Printed on invoices and estimates only. */
  ownerPhone: string;
  email: string;
  websites: string;
  logoSmall: string;
  logoLarge: string;
  logoPrint: string;
  /** Title of the staff app, e.g. "Acme Group Accounting". */
  appName: string;
  /** Map link to the shop (Google Maps share link), printed as a QR code on bills. */
  mapLink: string;
  instagram: string;
  facebook: string;
  youtube: string;
  /** Short safe word for file names, e.g. "acme". */
  fileSlug: string;
};

/** The settings keys (acct_business_settings) behind each brand field. */
export const BRAND_KEYS: Record<Exclude<keyof Brand, "fileSlug">, string> = {
  groupName: "brand_group_name",
  shopName: "brand_shop_name",
  tagline: "brand_tagline",
  place: "brand_place",
  description: "brand_description",
  parentLine: "brand_parent_line",
  watermark: "brand_watermark",
  shopPhone: "brand_shop_phone",
  ownerPhone: "brand_owner_phone",
  email: "brand_email",
  websites: "brand_websites",
  logoSmall: "brand_logo_small",
  logoLarge: "brand_logo_large",
  logoPrint: "brand_logo_print",
  appName: "brand_app_name",
  mapLink: "brand_map_link",
  instagram: "brand_instagram",
  facebook: "brand_facebook",
  youtube: "brand_youtube",
};

export const DEFAULT_LOGOS = {
  small: "/brand/logo-192.png",
  large: "/brand/logo-512.png",
  print: "/brand/logo-print.png",
};

/** Links printed as QR codes on bills: only full https addresses, in a fixed order. */
export function billLinks(brand: Brand): Array<{ label: string; url: string }> {
  const ok = (u: string) => /^https:\/\/[^\s"'<>]+$/.test(u);
  return [
    { label: "Find the shop", url: brand.mapLink },
    { label: "Instagram", url: brand.instagram },
    { label: "Facebook", url: brand.facebook },
    { label: "YouTube", url: brand.youtube },
  ].filter((l) => ok(l.url));
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "business";
}

/** Builds the brand from the business row and its settings; a missing setting falls back to the business name. */
export function brandFrom(
  business: { legal_name?: string | null; trading_name?: string | null },
  settings: Record<string, string | undefined>
): Brand {
  const get = (k: keyof typeof BRAND_KEYS) => (settings[BRAND_KEYS[k]] ?? "").trim();
  const groupName = get("groupName") || (business.trading_name ?? "").trim() || (business.legal_name ?? "").trim() || "Our business";
  const shopName = get("shopName") || groupName;
  return {
    groupName,
    shopName,
    tagline: get("tagline"),
    place: get("place"),
    description: get("description"),
    parentLine: get("parentLine") || (shopName !== groupName ? `A ${groupName} company` : ""),
    watermark: get("watermark") || (shopName !== groupName ? `${shopName} | ${groupName}` : shopName),
    shopPhone: get("shopPhone"),
    ownerPhone: get("ownerPhone"),
    email: get("email"),
    websites: get("websites"),
    logoSmall: get("logoSmall") || DEFAULT_LOGOS.small,
    logoLarge: get("logoLarge") || DEFAULT_LOGOS.large,
    logoPrint: get("logoPrint") || DEFAULT_LOGOS.print,
    appName: get("appName") || `${groupName} Accounting`,
    mapLink: get("mapLink"),
    instagram: get("instagram"),
    facebook: get("facebook"),
    youtube: get("youtube"),
    fileSlug: slugify(shopName),
  };
}

/**
 * SQL that gives the group name for a business id expression (for queries that label group-level rows),
 * matching brandFrom(): the brand_group_name setting, else the trading name, else the legal name.
 */
export function groupNameSql(businessIdExpr: string): string {
  return `COALESCE(
    (SELECT NULLIF(TRIM(bs.setting_value), '') FROM acct_business_settings bs WHERE bs.legal_business_id = ${businessIdExpr} AND bs.setting_key = 'brand_group_name'),
    (SELECT COALESCE(NULLIF(TRIM(lb.trading_name), ''), lb.legal_name) FROM acct_legal_businesses lb WHERE lb.id = ${businessIdExpr}))`;
}
