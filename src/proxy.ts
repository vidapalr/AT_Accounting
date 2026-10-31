import { NextResponse, type NextRequest } from "next/server.js";

/**
 * Two addresses, one app:
 *  - textiles.abhiraminc.com  -> only the public shop (no login, no accounting pages)
 *  - accounting.abhiraminc.com -> the accounting app; old /shop links jump to the shop address
 * Any other address (localhost, preview) is left exactly as it was.
 */
const SHOP_HOST = (process.env.TEXTILES_HOST ?? "textiles.abhiraminc.com").toLowerCase();
const APP_HOST = (process.env.ACCOUNTING_HOST ?? "accounting.abhiraminc.com").toLowerCase();

const SHOP_ALLOWED = [/^\/shop(\/|$)/, /^\/api\/shop(\/|$)/, /^\/brand(\/|$)/, /^\/images(\/|$)/, /^\/favicon\.ico$/, /^\/robots\.txt$/];

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname, search } = request.nextUrl;

  if (host === SHOP_HOST) {
    if (pathname === "/") return NextResponse.redirect(`https://${SHOP_HOST}/shop`, 308);
    if (SHOP_ALLOWED.some((r) => r.test(pathname))) return NextResponse.next();
    return NextResponse.redirect(`https://${APP_HOST}${pathname}${search}`, 308);
  }

  if (host === APP_HOST && /^\/shop(\/|$)/.test(pathname)) {
    return NextResponse.redirect(`https://${SHOP_HOST}${pathname}${search}`, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
