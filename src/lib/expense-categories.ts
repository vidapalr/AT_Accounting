/** Kinds of expense, in the order shown on forms. One list for the forms, the checks and the reports. */
export const EXPENSE_CATEGORIES: ReadonlyArray<readonly [key: string, label: string]> = [
  ["RENT", "Rent"],
  ["ELECTRICITY", "Electricity"],
  ["TRANSPORT", "Transport"],
  ["PACKING", "Packing"],
  ["SALARY", "Salary"],
  ["EMPLOYER_CONTRIBUTION", "Employer PF and ESI"],
  ["MAINTENANCE", "Maintenance"],
  ["MARKETING", "Marketing"],
  ["INTERNET_PHONE", "Internet / Phone"],
  ["OFFICE_SUPPLIES", "Office Supplies"],
  ["BANK_CHARGES", "Bank Charges"],
  ["MISCELLANEOUS", "Miscellaneous"],
];

export const EXPENSE_CATEGORY_KEYS = new Set(EXPENSE_CATEGORIES.map(([k]) => k));
