// Note counter for closing the day: how many notes of each kind, and the total in paise.
export const NOTE_VALUES = [500, 200, 100, 50, 20, 10] as const;

export type Denominations = { notes: Record<string, number>; coins: bigint };

/** Total in paise. notes: { "500": 3, ... } counts; coinsPaise: loose coins/other in paise. */
export function denominationTotal(notes: Record<string, number>, coinsPaise: bigint = 0n): bigint {
  let total = coinsPaise;
  for (const v of NOTE_VALUES) {
    const n = notes[String(v)] ?? 0;
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new Error("bad note count");
    total += BigInt(n) * BigInt(v) * 100n;
  }
  return total;
}

/** Reads the JSON sent by the form. Returns null when nothing was counted. */
export function parseDenominations(json: string): { notes: Record<string, number>; coins: bigint } | null {
  if (!json.trim()) return null;
  const raw = JSON.parse(json) as { notes?: Record<string, unknown>; coins?: unknown };
  const notes: Record<string, number> = {};
  for (const v of NOTE_VALUES) {
    const n = Number(raw.notes?.[String(v)] ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new Error("bad note count");
    if (n > 0) notes[String(v)] = n;
  }
  const c = Number(raw.coins ?? 0);
  if (!Number.isInteger(c) || c < 0 || c > 1_000_000_000) throw new Error("bad coins");
  return { notes, coins: BigInt(c) };
}
