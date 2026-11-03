export type SearchPage = { label: string; href: string; hint?: string; group: string };

/** Pages whose name, hint or menu group contains every word typed. Name matches come first. */
export function searchPages(pages: SearchPage[], query: string, limit = 8): SearchPage[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: Array<{ p: SearchPage; score: number }> = [];
  for (const p of pages) {
    const label = p.label.toLowerCase();
    const rest = `${p.hint ?? ""} ${p.group}`.toLowerCase();
    if (!words.every((w) => label.includes(w) || rest.includes(w))) continue;
    const score = (label.startsWith(words[0]) ? 0 : words.every((w) => label.includes(w)) ? 1 : 2);
    scored.push({ p, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((s) => s.p);
}
