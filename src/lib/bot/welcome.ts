// What the bot sends after its first reply of the day: shop details and the newest product photos.
// Pure functions so they can be tested.

export const MAX_WELCOME_PHOTOS = 8;
export const DEFAULT_WELCOME_PHOTOS = 5;

export function welcomePhotoCount(raw: string | null | undefined): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || raw === "" || raw == null) return DEFAULT_WELCOME_PHOTOS;
  return Math.min(MAX_WELCOME_PHOTOS, Math.max(0, n));
}

export type WelcomeCandidate = { id: number; name: string; fromPrice: number | null; available: boolean; coverId: number | null };

/** Newest first, only items in stock with a price and a photo. */
export function pickWelcomeProducts(items: WelcomeCandidate[], count: number): WelcomeCandidate[] {
  return items
    .filter((p) => p.coverId !== null && p.available && p.fromPrice !== null && p.fromPrice > 0)
    .sort((a, b) => b.id - a.id)
    .slice(0, Math.max(0, count));
}

export function photoCaption(name: string, fromPrice: number, link: string): string {
  return `${name}\nFrom \u20b9${Math.round(fromPrice).toLocaleString("en-IN")}\n${link}`;
}
