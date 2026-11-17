import { getBrand } from "@/lib/brand";

/**
 * Web app manifest, per company: lets staff "Add to Home screen" on a phone and open the app full-screen
 * with the company's own name and logo. First step towards the mobile app (docs/MOBILE_APP.md).
 */
export async function GET() {
  const brand = await getBrand();
  const manifest = {
    name: brand.appName,
    short_name: brand.groupName.slice(0, 12),
    description: `${brand.appName}: sales, stock, money and customers`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#142c50",
    icons: [
      { src: brand.logoSmall, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: brand.logoLarge, sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=3600" },
  });
}
