/** GST helpers. Pure functions, no database. */

export const GST_STATES: ReadonlyArray<{ code: string; name: string }> = [
  ["01", "Jammu and Kashmir"], ["02", "Himachal Pradesh"], ["03", "Punjab"], ["04", "Chandigarh"],
  ["05", "Uttarakhand"], ["06", "Haryana"], ["07", "Delhi"], ["08", "Rajasthan"],
  ["09", "Uttar Pradesh"], ["10", "Bihar"], ["11", "Sikkim"], ["12", "Arunachal Pradesh"],
  ["13", "Nagaland"], ["14", "Manipur"], ["15", "Mizoram"], ["16", "Tripura"],
  ["17", "Meghalaya"], ["18", "Assam"], ["19", "West Bengal"], ["20", "Jharkhand"],
  ["21", "Odisha"], ["22", "Chhattisgarh"], ["23", "Madhya Pradesh"], ["24", "Gujarat"],
  ["26", "Dadra and Nagar Haveli and Daman and Diu"], ["27", "Maharashtra"], ["29", "Karnataka"],
  ["30", "Goa"], ["31", "Lakshadweep"], ["32", "Kerala"], ["33", "Tamil Nadu"],
  ["34", "Puducherry"], ["35", "Andaman and Nicobar Islands"], ["36", "Telangana"],
  ["37", "Andhra Pradesh"], ["38", "Ladakh"], ["97", "Other Territory"],
].map(([code, name]) => ({ code, name }));

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function stateFromGstin(gstin: string | null | undefined): { code: string; name: string } | null {
  const g = String(gstin ?? "").trim().toUpperCase();
  if (!GSTIN_PATTERN.test(g)) return null;
  return GST_STATES.find(s => s.code === g.slice(0, 2)) ?? null;
}

/** HSN for goods: digits only, 4 to 8 long. Blank is allowed (not set yet). */
export function validHsn(value: string): boolean {
  return value === "" || /^[0-9]{4,8}$/.test(value);
}

/** A tax rate such as 5 or 12.5: 0 to 100, at most two decimals. Blank = not set. */
export function parseRate(value: string): { ok: boolean; rate: string | null } {
  const v = value.trim();
  if (v === "") return { ok: true, rate: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v) || Number(v) > 100) return { ok: false, rate: null };
  return { ok: true, rate: v };
}

/**
 * Splits a tax amount in whole paise. Same state: half CGST, half SGST (SGST takes
 * any odd paisa). Other state: all IGST. Used when GST is switched on.
 */
export function splitTax(taxPaise: bigint, sameState: boolean): { cgst: bigint; sgst: bigint; igst: bigint } {
  if (!sameState) return { cgst: 0n, sgst: 0n, igst: taxPaise };
  const cgst = taxPaise / 2n;
  return { cgst, sgst: taxPaise - cgst, igst: 0n };
}
