/**
 * Number and date formats used across screens and messages. One place, so every screen shows money
 * the same way. Money in the books stays exact (paise); these are for display only.
 */

/** ₹12,345.50 */
export const inr2 = (n: number): string => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** ₹12,346 */
export const inr0 = (n: number): string => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export { todayInIndia } from "./reports/money.ts";
