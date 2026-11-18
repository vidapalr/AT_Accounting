/** Kinds of government registration the business keeps, with the usual portal for each (pure). */
export const REGISTRATION_KINDS = [
  { key: "GST", label: "GST", portal: "https://services.gst.gov.in", numberHint: "GSTIN (15 characters)" },
  { key: "INCOME_TAX", label: "Income tax (PAN)", portal: "https://www.incometax.gov.in", numberHint: "PAN" },
  { key: "TDS", label: "TDS (TAN, TRACES)", portal: "https://www.tdscpc.gov.in", numberHint: "TAN" },
  { key: "PF", label: "Provident fund (EPFO)", portal: "https://unifiedportal-emp.epfindia.gov.in", numberHint: "PF establishment code" },
  { key: "ESI", label: "ESI", portal: "https://www.esic.gov.in", numberHint: "ESI employer code (17 digits)" },
  { key: "PROFESSIONAL_TAX", label: "Professional tax", portal: "", numberHint: "PT registration number" },
  { key: "SHOP_LICENCE", label: "Shops and establishments licence", portal: "", numberHint: "Licence number" },
  { key: "TRADE_LICENCE", label: "Trade licence (municipality)", portal: "", numberHint: "Licence number" },
  { key: "UDYAM", label: "Udyam (MSME)", portal: "https://udyamregistration.gov.in", numberHint: "Udyam number" },
  { key: "BANK", label: "Net banking", portal: "", numberHint: "Customer ID" },
  { key: "OTHER", label: "Other", portal: "", numberHint: "Number" },
] as const;

export type RegistrationKind = (typeof REGISTRATION_KINDS)[number]["key"];
export const isRegistrationKind = (v: string): v is RegistrationKind => REGISTRATION_KINDS.some((k) => k.key === v);

/** Days until a renewal date (negative when it has passed), or null. */
export function daysToRenewal(today: string, due: string | null): number | null {
  if (!due) return null;
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
