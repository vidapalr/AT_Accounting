/**
 * Settings that belong to the installation (the server), not to a company.
 * Everything a company can change lives in acct_business_settings instead (see brand-core.ts, tenant.ts).
 * Values come from environment variables on the hosting service; the defaults below are neutral.
 */

const env = (name: string) => (process.env[name] ?? "").trim();

/** Start of every cookie name, so two installations on one domain never mix sessions. */
export const COOKIE_PREFIX = (env("COOKIE_PREFIX") || "app").replace(/[^a-z0-9_]/gi, "").toLowerCase() || "app";

export const SESSION_COOKIE = `${COOKIE_PREFIX}_session`;
export const TWO_STEP_COOKIE = `${COOKIE_PREFIX}_2fa`;
export const BACKUP_CODES_COOKIE = `${COOKIE_PREFIX}_backup_codes`;
export const SHOP_SESSION_COOKIE = `${COOKIE_PREFIX}_shop_session`;

/** "host1,host2" -> ["host1","host2"], lower case. */
export function hostList(value: string): string[] {
  return value.split(",").map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "")).filter(Boolean);
}

/** Addresses that show only the public shop (proxy.ts). SHOP_HOSTS, or the old TEXTILES_HOST, or the host of SHOP_PUBLIC_URL. */
export function shopHosts(): string[] {
  return hostList(env("SHOP_HOSTS") || env("TEXTILES_HOST") || env("SHOP_PUBLIC_URL"));
}

/** Addresses of the staff app (proxy.ts). APP_HOSTS, or the old ACCOUNTING_HOST, or the host of APP_PUBLIC_URL. */
export function appHosts(): string[] {
  return hostList(env("APP_HOSTS") || env("ACCOUNTING_HOST") || env("APP_PUBLIC_URL"));
}

/** AI assistant (read-only answers): the Anthropic API key, and the model to use. Empty key = assistant off. */
export const AI_API_KEY = env("ANTHROPIC_API_KEY");
export const AI_MODEL = env("AI_MODEL") || "claude-sonnet-5-5";
