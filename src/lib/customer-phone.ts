/**
 * Customer phone numbers are stored as the 10 digit Indian mobile number only,
 * so "+91 98765 43210", "09876543210" and "98765-43210" are the same customer.
 * Pure functions: no database, easy to test.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? last10 : null;
}

/** Shown to people: 98765 43210. */
export function prettyPhone(phone: string | null | undefined): string {
  if (!phone || phone.length !== 10) return phone ?? "";
  return `${phone.slice(0, 5)} ${phone.slice(5)}`;
}
