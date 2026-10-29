// The chatbot's thinking, with no database and no network, so it can be tested on its own.
// It never guesses: it answers only from saved answers, shop data it is handed, or hands the chat to a person.

export const BRAND = "Abhiram Textiles";
export const TAG = "Elegance in every thread";

export const TEXT = {
  menu: `Hello! Welcome to ${BRAND} - ${TAG}.\n\nReply with a number:\n1 - Prices and availability\n2 - Order status\n3 - Talk to a person\n\nOr just type your question.`,
  askProduct: "Please type the name of the item, for example: banarasi saree.",
  askOrder: "Please send your order number, for example WEB-00012.",
  handoff: "Thank you! Our team will reply to you shortly. They reply during shop hours.",
  noProduct: "We could not find that item in our online shop. Our team will help you shortly. They reply during shop hours.",
  noOrder: "We could not find that order for this number. Please check the order number, or type 3 to talk to a person.",
};

const GREET = new Set(["hi", "hii", "hiii", "hello", "helo", "hai", "hey", "namaste", "namaskar", "namaskaram", "good", "morning", "afternoon", "evening", "ok", "okay", "thanks", "thank", "you", "thx", "ty", "welcome", "bye"]);
const GREET_WORDS = new Set(["hi", "hii", "hiii", "hello", "helo", "hai", "hey", "namaste", "namaskar", "namaskaram", "good"]);
const STOP = new Set(["the", "a", "an", "is", "are", "of", "for", "me", "my", "i", "you", "do", "does", "have", "has", "what", "whats", "which", "how", "much", "many", "can", "could", "please", "pls", "plz", "tell", "show", "want", "need", "to", "in", "on", "at", "and", "or", "it", "this", "that", "price", "prices", "rate", "rates", "cost", "stock", "available", "availability", "any", "your", "there", "u", "ur"]);
const PRICE_WORDS = ["price", "prices", "rate", "rates", "cost", "how much", "stock", "available", "availability", "have", "avail"];

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const stem = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
export const words = (text: string): string[] => normalize(text).split(" ").filter(Boolean);

export type Intent =
  | { kind: "MENU"; n: 1 | 2 | 3 }
  | { kind: "PERSON" }
  | { kind: "ORDER"; orderNo: string }
  | { kind: "GREETING" }
  | { kind: "PRODUCT"; query: string }
  | { kind: "OTHER" };

export function orderNoFrom(text: string, awaitingOrder: boolean): string | null {
  const m = /\bweb[\s-]?(\d{1,6})\b/i.exec(text);
  const digits = m ? m[1] : awaitingOrder ? /^\s*#?(\d{1,6})\s*$/.exec(text)?.[1] : null;
  return digits ? `WEB-${digits.padStart(5, "0")}` : null;
}

export function classify(text: string, awaiting: "NONE" | "PRODUCT" | "ORDER"): Intent {
  const raw = text.trim();
  const n = normalize(raw);
  const w = n.split(" ").filter(Boolean);
  if (w.length === 0) return { kind: "OTHER" };
  if (/^[1-3]$/.test(raw)) return { kind: "MENU", n: Number(raw) as 1 | 2 | 3 };
  if (/\b(talk|speak|chat) to\b|\b(human|agent|person|someone|manager|call me|call back|callback)\b/.test(n)) return { kind: "PERSON" };
  const order = orderNoFrom(raw, awaiting === "ORDER");
  if (order) return { kind: "ORDER", orderNo: order };
  if (awaiting === "PRODUCT") return { kind: "PRODUCT", query: raw };
  if (w.every((x) => GREET.has(x)) && w.some((x) => GREET_WORDS.has(x))) return { kind: "GREETING" };
  if (w.every((x) => GREET.has(x))) return { kind: "GREETING" };
  const asksPrice = PRICE_WORDS.some((p) => (` ${n} `).includes(` ${p} `));
  const rest = w.filter((x) => !STOP.has(x) && !GREET.has(x));
  if (asksPrice && rest.length > 0) return { kind: "PRODUCT", query: rest.join(" ") };
  return { kind: "OTHER" };
}

export type SavedAnswer = { id: number; title: string; keywords: string; reply: string };

/** The saved answer whose keyword phrases appear most in the message, or null. */
export function matchAnswer(text: string, answers: SavedAnswer[]): SavedAnswer | null {
  const padded = ` ${words(text).map(stem).join(" ")} `;
  let best: { a: SavedAnswer; score: number } | null = null;
  for (const a of answers) {
    let score = 0;
    for (const phrase of a.keywords.split(",")) {
      const p = words(phrase).map(stem).join(" ");
      if (p && padded.includes(` ${p} `)) score += p.split(" ").length;
    }
    if (score > 0 && (!best || score > best.score)) best = { a, score };
  }
  return best ? best.a : null;
}

export type ShopItem = { id: number; name: string; fabric: string | null; fromPrice: number | null; available: boolean };

/** Shop products matching the words the customer typed (best first, at most 3). */
export function matchProducts(query: string, items: ShopItem[]): ShopItem[] {
  const q = words(query).filter((x) => !STOP.has(x) && !GREET.has(x) && x.length >= 3).map(stem);
  if (q.length === 0) return [];
  const scored = items.map((it) => {
    const hay = new Set(words(`${it.name} ${it.fabric ?? ""}`).map(stem));
    const score = q.filter((t) => hay.has(t) || [...hay].some((h) => h.startsWith(t) && t.length >= 4)).length;
    return { it, score };
  });
  const need = Math.max(1, Math.ceil(q.length / 2));
  return scored.filter((s) => s.score >= need).sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.it);
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function productReply(found: ShopItem[], shopUrl: string): string {
  const lines = found.map((p) => `*${p.name}*${p.fromPrice !== null ? ` - from ${inr(p.fromPrice)}` : " - ask us for the price"} - ${p.available ? "in stock" : "currently out of stock"}\n${shopUrl}/shop/${p.id}`);
  return `${lines.join("\n\n")}\n\nTo talk to a person, reply 3.`;
}

export const ORDER_WORDS: Record<string, string> = {
  REQUESTED: "received. We will confirm the availability and shipping charge shortly",
  CONFIRMED: "confirmed. We will message you about payment",
  COMPLETED: "billed and on its way to you",
  CANCELLED: "cancelled",
};

export function orderReply(o: { orderNo: string; status: string; items: number; shipping: number }): string {
  const total = o.status === "REQUESTED" ? `Items ${inr(o.items)} (shipping to be confirmed)` : `Total ${inr(o.items + o.shipping)}`;
  return `Your order ${o.orderNo} is ${ORDER_WORDS[o.status] ?? o.status.toLowerCase()}.\n${total}.`;
}

/** The last ten digits of a phone number, for comparing numbers written differently. */
export const last10 = (s: string) => s.replace(/\D/g, "").slice(-10);

export type OwnerCommand =
  | { kind: "SALES"; day: "today" | "yesterday" }
  | { kind: "STOCK"; query: string }
  | { kind: "OWES" }
  | { kind: "ORDERS" }
  | { kind: "HELP" };

export function ownerCommand(text: string): OwnerCommand {
  const n = normalize(text);
  const w = n.split(" ");
  if (/^(stock|stocks|qty)\b/.test(n) || /\bstock of\b/.test(n)) {
    const q = w.filter((x) => !["stock", "stocks", "qty", "of", "the", "in"].includes(x)).join(" ");
    return q ? { kind: "STOCK", query: q } : { kind: "HELP" };
  }
  if (/\b(owe|owes|dues|due|pending|outstanding)\b/.test(n)) return { kind: "OWES" };
  if (/\borders?\b/.test(n)) return { kind: "ORDERS" };
  if (/\b(sales|sale|sold|today|yesterday|business)\b/.test(n)) return { kind: "SALES", day: /\byesterday\b/.test(n) ? "yesterday" : "today" };
  return { kind: "HELP" };
}

export const OWNER_HELP = "You can ask me:\n- sales today / sales yesterday\n- stock red silk\n- who owes\n- orders\nI only read your data. I never change anything.";
