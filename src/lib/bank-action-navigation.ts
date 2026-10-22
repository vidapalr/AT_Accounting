const BANK_ACCOUNTS_PATH = "/accounting/bank-accounts";

export function getBankReturnPath(form: FormData): string {
  const value = form.get("return_to");

  if (typeof value !== "string") {
    return BANK_ACCOUNTS_PATH;
  }

  const returnTo = value.trim();

  if (returnTo === BANK_ACCOUNTS_PATH) {
    return returnTo;
  }

  const agreementMatch =
    /^\/funding\/agreements\/([1-9]\d*)$/.exec(returnTo);

  if (
    agreementMatch &&
    Number.isSafeInteger(Number(agreementMatch[1]))
  ) {
    return returnTo;
  }

  return BANK_ACCOUNTS_PATH;
}

export function getBankResultQueryKey(returnTo: string): string {
  return returnTo === BANK_ACCOUNTS_PATH ? "evidence" : "bankEvidence";
}
