/**
 * Slices for a pie (pure). At most `max` slices: the largest parts keep their own slice and the rest
 * fold into "Other". Colours follow the order of the parts (largest first) from a fixed, colour-blind
 * checked palette, and "Other" is always grey, so a colour never stands for two things in one chart.
 */
export type SliceIn = { label: string; value: number };
export type Slice = SliceIn & { share: number; color: string };

/** Categorical palette (validated for colour-blind separation, light surface), in fixed order. */
export const PIE_COLOURS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"] as const;
export const OTHER_COLOUR = "#a3a29c";

export function pieSlices(parts: SliceIn[], max = 6): Slice[] {
  const positive = parts.filter((p) => Number.isFinite(p.value) && p.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((t, p) => t + p.value, 0);
  if (total <= 0) return [];
  const keep = positive.length > max ? positive.slice(0, max - 1) : positive;
  const rest = positive.length > max ? positive.slice(max - 1) : [];
  const slices: Slice[] = keep.map((p, i) => ({ ...p, share: p.value / total, color: PIE_COLOURS[i] }));
  if (rest.length) {
    const v = rest.reduce((t, p) => t + p.value, 0);
    slices.push({ label: `Other (${rest.length})`, value: v, share: v / total, color: OTHER_COLOUR });
  }
  return slices;
}

/** SVG path of a donut slice between two angles (radians, 0 = top, clockwise). */
export function arcPath(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  const full = a1 - a0 >= Math.PI * 2 - 1e-9;
  if (full) a1 = a0 + Math.PI * 2 - 1e-4;
  const p = (rad: number, rr: number) => [cx + rr * Math.sin(rad), cy - rr * Math.cos(rad)].map((n) => Math.round(n * 100) / 100);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(a0, r);
  const [x1, y1] = p(a1, r);
  const [x2, y2] = p(a1, inner);
  const [x3, y3] = p(a0, inner);
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${inner},${inner} 0 ${large} 0 ${x3},${y3} Z`;
}
