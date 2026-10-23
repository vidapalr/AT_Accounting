/**
 * Reads the short messages employees send, for example:
 *   RECEIVED ATX_CS_BS_SS_01 10
 *   DAMAGED ATX_CS_BS_01 2 torn at the edge
 *   COUNT 2000000000244 14
 *   SOLD ATX_CS_BS_SS_01 1 at 1500
 * One line per item; several lines in one message are fine.
 * Pure functions, no database.
 */

export type StockAction = "RECEIVED" | "DAMAGED" | "LOST" | "COUNT" | "SOLD";

export type ParsedLine = {
  raw: string;
  action: StockAction | null;
  /** The SKU or barcode as typed. */
  item: string | null;
  quantity: number | null;
  price: number | null;
  note: string | null;
  problem: string | null;
};

const KEYWORDS: Record<string, StockAction> = {
  RECEIVED: "RECEIVED", RECEIVE: "RECEIVED", GOT: "RECEIVED", IN: "RECEIVED", ARRIVED: "RECEIVED",
  DAMAGED: "DAMAGED", DAMAGE: "DAMAGED", BROKEN: "DAMAGED",
  LOST: "LOST", LOSS: "LOST", MISSING: "LOST",
  COUNT: "COUNT", COUNTED: "COUNT", STOCK: "COUNT",
  SOLD: "SOLD", SALE: "SOLD", SELL: "SOLD",
};

export const HELP_TEXT =
  "Send one line per item, like:\n" +
  "RECEIVED ITEMCODE 10\nDAMAGED ITEMCODE 2 torn\nLOST ITEMCODE 1\nCOUNT ITEMCODE 14\nSOLD ITEMCODE 1 at 1500";

function number(token: string | undefined): number | null {
  if (!token) return null;
  const n = Number(token.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseStockMessage(text: string): ParsedLine[] {
  const lines = String(text ?? "")
    .split(/[\r\n;]+/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 50);

  return lines.map((raw): ParsedLine => {
    const bad = (problem: string): ParsedLine => ({
      raw: raw.slice(0, 500), action: null, item: null, quantity: null, price: null, note: null, problem,
    });

    const words = raw.replace(/[,:]/g, " ").split(/\s+/).filter(Boolean);
    const action = KEYWORDS[words[0]?.toUpperCase()];
    if (!action) return bad("Start with RECEIVED, DAMAGED, LOST, COUNT or SOLD.");

    const item = words[1];
    if (!item) return bad("The item code is missing.");

    let i = 2;
    if (words[i]?.toLowerCase() === "x" || words[i] === "*") i += 1;
    const quantity = number(words[i]);
    if (quantity === null) return bad("The quantity is missing or is not a number.");
    if (quantity < 0 || (action !== "COUNT" && quantity === 0)) return bad("The quantity must be more than zero.");
    i += 1;

    let price: number | null = null;
    if (action === "SOLD") {
      if (/^(at|@|rs\.?|₹)$/i.test(words[i] ?? "")) i += 1;
      const p = number(words[i]?.replace(/^[@₹]|^rs\.?/i, ""));
      if (p !== null) {
        price = p;
        i += 1;
      }
    }

    const note = words.slice(i).join(" ").slice(0, 300) || null;
    return { raw: raw.slice(0, 500), action, item, quantity, price, note, problem: null };
  });
}
