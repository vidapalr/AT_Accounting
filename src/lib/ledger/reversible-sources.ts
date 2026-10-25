/**
 * Journals the app creates itself from operational records. The owner may reverse
 * them: the record is then shown as waiting to be posted again (see sync-status),
 * so the books and the records can never silently disagree.
 */
export const APP_POSTED_SOURCES = [
  "DEPOSIT_PAID", "DEPOSIT_REFUND", "EXPENSE", "EXPENSE_PAYMENT",
  "PURCHASE_RECEIPT", "PURCHASE_PAYMENT", "SALES_INVOICE", "SALES_RECEIPT",
  "SALES_RETURN", "SALES_REFUND", "STOCK_DAMAGE", "SETUP_CAPITALISATION",
  "SUPPLIER_RETURN", "SUPPLIER_REFUND", "FREE_STOCK",
] as const;

export const isAppPostedSource = (source: string | null): boolean =>
  source !== null && (APP_POSTED_SOURCES as readonly string[]).includes(source);

/** Adjustment entries the owner records on the auditor's advice. Reversible, but never "re-posted" from a record. */
export const AUDITOR_ADJUSTMENT_SOURCE = "AUDITOR_ADJUSTMENT";

/** Journals the owner may reverse from the journal page. */
export const isReversibleSource = (source: string | null): boolean =>
  isAppPostedSource(source) || source === AUDITOR_ADJUSTMENT_SOURCE;
