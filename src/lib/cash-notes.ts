// Note-by-note cash handling: notes received from the customer, change handed back, and the
// notes that should be in the drawer. Plain functions so they can be tested.
export const NOTE_KINDS = [500, 200, 100, 50, 20, 10] as const;

/** Count of each note kind, e.g. { "500": 2, "100": 1 }. Coins are not tracked here. */
export type NoteCounts = Record<string, number>;

/** Reads a note-count object (or its JSON). Anything not a clean count is dropped. */
export function cleanNotes(raw: unknown): NoteCounts {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  const out: NoteCounts = {};
  if (!obj || typeof obj !== "object") return out;
  for (const v of NOTE_KINDS) {
    const n = Number((obj as Record<string, unknown>)[String(v)] ?? 0);
    if (Number.isInteger(n) && n > 0 && n <= 100000) out[String(v)] = n;
  }
  return out;
}

/** Value of the notes in whole rupees. */
export function notesValue(notes: NoteCounts): number {
  return NOTE_KINDS.reduce((s, v) => s + (notes[String(v)] ?? 0) * v, 0);
}

/** Opening notes + every movement. received adds, change subtracts. May go negative if entries are missing. */
export function expectedNotes(
  opening: NoteCounts,
  moves: { received: NoteCounts; change: NoteCounts }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of NOTE_KINDS) {
    let n = opening[String(v)] ?? 0;
    for (const m of moves) n += (m.received[String(v)] ?? 0) - (m.change[String(v)] ?? 0);
    out[String(v)] = n;
  }
  return out;
}

/** Checks a cash payment's note entry. amountRs is the part of the bill paid in cash. */
export function checkNoteEntry(amountRs: number, received: NoteCounts, change: NoteCounts):
  { ok: true } | { ok: false; reason: string } {
  const r = notesValue(received);
  const c = notesValue(change);
  if (r === 0 && c === 0) return { ok: true };
  if (r - c !== Math.round(amountRs) && Math.abs(r - c - amountRs) >= 1) {
    return { ok: false, reason: "Notes received minus change given should equal the cash amount (coins excepted)." };
  }
  return { ok: true };
}
