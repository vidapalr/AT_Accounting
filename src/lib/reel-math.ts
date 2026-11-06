// Timing of a photo reel: each photo shows for `seconds`, with a short cross-fade into the next and a slow zoom.
// Pure functions so the timing can be tested without a browser.

export const REEL_MIN_SECONDS = 2;
export const REEL_MAX_SECONDS = 5;
export const REEL_MAX_PHOTOS = 8;
export const REEL_FADE = 0.5;

export function clampSeconds(v: number): number {
  if (!Number.isFinite(v)) return 3;
  return Math.min(REEL_MAX_SECONDS, Math.max(REEL_MIN_SECONDS, v));
}

export function reelDuration(photos: number, seconds: number): number {
  return Math.max(0, photos) * clampSeconds(seconds);
}

export type Frame = { index: number; next: number | null; mix: number; zoom: number };

/** What to draw at time t (seconds): the photo, the one fading in (if any), how far, and the zoom of the current photo. */
export function frameAt(t: number, photos: number, seconds: number): Frame {
  const s = clampSeconds(seconds);
  const total = reelDuration(photos, s);
  const tt = Math.min(Math.max(0, t), Math.max(0, total - 0.0001));
  const index = Math.min(photos - 1, Math.floor(tt / s));
  const within = tt - index * s;
  const zoom = 1 + 0.08 * (within / s);
  const fadeStart = s - REEL_FADE;
  if (index < photos - 1 && within > fadeStart) {
    return { index, next: index + 1, mix: (within - fadeStart) / REEL_FADE, zoom };
  }
  return { index, next: null, mix: 0, zoom };
}

/** Sound level at time t: full, with a fade-out over the last second. */
export function volumeAt(t: number, total: number): number {
  if (total <= 0) return 0;
  const left = total - t;
  return left >= 1 ? 1 : Math.max(0, left);
}
