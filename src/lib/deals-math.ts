export const OPEN_STAGES = ["ENQUIRY", "QUOTED", "NEGOTIATING"] as const;
export const STAGES = [...OPEN_STAGES, "WON", "LOST"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  ENQUIRY: "Enquiry", QUOTED: "Quote given", NEGOTIATING: "Bargaining", WON: "Won", LOST: "Lost",
};

export function isStage(v: unknown): v is Stage {
  return (STAGES as readonly string[]).includes(String(v));
}

/** The next and previous open stage, for the arrow buttons. */
export function neighbour(stage: Stage, dir: 1 | -1): Stage | null {
  const i = (OPEN_STAGES as readonly string[]).indexOf(stage);
  if (i < 0) return null;
  return OPEN_STAGES[i + dir] ?? null;
}

export type DealLite = { stage: string; valuePaise: bigint };

/** Value and count per stage, for the column heads. */
export function stageTotals(deals: DealLite[]): Record<Stage, { count: number; valuePaise: bigint }> {
  const out = Object.fromEntries(STAGES.map((s) => [s, { count: 0, valuePaise: 0n }])) as Record<Stage, { count: number; valuePaise: bigint }>;
  for (const d of deals) if (isStage(d.stage)) { out[d.stage].count++; out[d.stage].valuePaise += d.valuePaise; }
  return out;
}

/** Won share of closed deals, as a whole percent, or null when nothing is closed yet. */
export function winRate(won: number, lost: number): number | null {
  const closed = won + lost;
  return closed === 0 ? null : Math.round((won / closed) * 100);
}
