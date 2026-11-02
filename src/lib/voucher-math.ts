import { financialYearLabel } from "@/lib/financial-year";

export type VoucherType = "CPV" | "BPV" | "OPV" | "IPV";

/** Which kind of voucher a payment gets. Advance clearing moves no money, so it gets none. */
export function voucherTypeFor(source: string, method: string): VoucherType | null {
  if (method === "ADVANCE") return null;
  if (source === "OWNER_PERSONAL") return "OPV";
  if (source === "INVESTOR_CASH" || source === "INVESTOR_BANK") return "IPV";
  if (source === "BUSINESS_BANK") return "BPV";
  if (source === "BUSINESS_CASH") return "CPV";
  return null;
}

export function formatVoucherNo(type: VoucherType, paymentDate: string, seq: number): string {
  return `${type}/${financialYearLabel(paymentDate).replace("–", "-")}/${String(seq).padStart(4, "0")}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "")); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

/** "Rupees One Lakh Forty One Thousand Five Hundred Twenty Five and Fifty Paise Only" from paise. */
export function rupeesInWords(paise: bigint): string {
  const rupees = Number(paise / 100n);
  const ps = Number(paise % 100n);
  if (rupees === 0 && ps === 0) return "Rupees Zero Only";
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;
  const out: string[] = [];
  if (crore) out.push(`${below1000(crore)} Crore`);
  if (lakh) out.push(`${below1000(lakh)} Lakh`);
  if (thousand) out.push(`${below1000(thousand)} Thousand`);
  if (rest) out.push(below1000(rest));
  let words = out.length ? `Rupees ${out.join(" ")}` : "Rupees Zero";
  if (ps) words += ` and ${below1000(ps)} Paise`;
  return `${words} Only`;
}
