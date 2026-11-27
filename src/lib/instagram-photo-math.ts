/**
 * Instagram only takes JPG photos whose shape is between 4:5 (tall) and 1.91:1 (wide). Pure: works out the
 * canvas a photo is placed on (white bars added, nothing cut off) and the size it is shrunk to.
 */
export const IG_MIN_RATIO = 4 / 5;
export const IG_MAX_RATIO = 1.91;
export const IG_MAX_WIDTH = 1440;

export function igCanvas(width: number, height: number): { width: number; height: number; scaledWidth: number; scaledHeight: number } {
  const scale = width > IG_MAX_WIDTH ? IG_MAX_WIDTH / width : 1;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const ratio = w / h;
  if (ratio < IG_MIN_RATIO) return { width: Math.ceil(h * IG_MIN_RATIO), height: h, scaledWidth: w, scaledHeight: h };
  if (ratio > IG_MAX_RATIO) return { width: w, height: Math.ceil(w / IG_MAX_RATIO), scaledWidth: w, scaledHeight: h };
  return { width: w, height: h, scaledWidth: w, scaledHeight: h };
}
