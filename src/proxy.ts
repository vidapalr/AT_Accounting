import { NextResponse, type NextRequest } from "next/server.js";

import { appHosts, shopHosts } from "./lib/app-config.ts";

/**
 * Two kinds of address, one app (set on the hosting service, nothing fixed in code):
 *  - SHOP_HOSTS (or TEXTILES_HOST / SHOP_PUBLIC_URL) -> only the public shop (no login, no accounting pages)
 *  - APP_HOSTS (or ACCOUNTING_HOST / APP_PUBLIC_URL)  -> the staff app; old /shop links jump to the shop address
 * The n-th shop address pairs with the n-th app address (one pair per company).
 * Any other address (localhost, preview) is left exactly as it was.
 */

const SHOP_ALLOWED = [/^\/shop(\/|$)/, /^\/api\/shop(\/|$)/, /^\/brand(\/|$)/, /^\/images(\/|$)/, /^\/favicon\.ico$/, /^\/robots\.txt$/, /^\/manifest\.webmanifest$/];

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname, search } = request.nextUrl;
  const shops = shopHosts();
  const apps = appHosts();

  const shopIndex = shops.indexOf(host);
  if (shopIndex >= 0) {
    if (pathname === "/") return NextResponse.redirect(`https://${host}/shop`, 308);
    if (SHOP_ALLOWED.some((r) => r.test(pathname))) return NextResponse.next();
    const app = apps[shopIndex] ?? apps[0];
    return app ? NextResponse.redirect(`https://${app}${pathname}${search}`, 308) : NextResponse.next();
  }

  const appIndex = apps.indexOf(host);
  if (appIndex >= 0 && /^\/shop(\/|$)/.test(pathname)) {
    const shop = shops[appIndex] ?? shops[0];
    if (shop) return NextResponse.redirect(`https://${shop}${pathname}${search}`, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
