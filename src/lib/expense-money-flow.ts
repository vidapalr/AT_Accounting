// Expense payments affect cash flow when paid, not when an expense is created.
// Keep external funding separate from business bank/cash movements.
export type PaymentAccount = {
  payment_source: string;
  bank_account_id: number | null;
  cash_account_id: number | null;
};

export function expenseAccountKey(
  payment: PaymentAccount,
  bankOwnership: ReadonlyMap<number, string>,
  cashAccountIds: ReadonlySet<number>,
): string {
  const bankId = payment.bank_account_id === null
    ? null : Number(payment.bank_account_id);
  const cashId = payment.cash_account_id === null
    ? null : Number(payment.cash_account_id);

  switch (payment.payment_source) {
    case "BUSINESS_BANK":
    case "INVESTOR_BANK": {
      const expected = payment.payment_source === "BUSINESS_BANK"
        ? "BUSINESS" : "INVESTOR";
      return bankId !== null && cashId === null &&
        bankOwnership.get(bankId) === expected
        ? `BANK:${bankId}` : "UNALLOCATED";
    }
    case "BUSINESS_CASH":
      return cashId !== null && bankId === null && cashAccountIds.has(cashId)
        ? `CASH:${cashId}` : "UNALLOCATED";
    case "INVESTOR_CASH":
    case "OWNER_PERSONAL":
      return bankId === null && cashId === null
        ? "EXTERNAL" : "UNALLOCATED";
    default:
      return "UNALLOCATED";
  }
}

export function expensePaymentPaise(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid expense payment amount");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
