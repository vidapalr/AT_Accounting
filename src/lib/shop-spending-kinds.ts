/** What staff can pick, in plain words, and the expense category each one files under. */
export const SPENDING_KINDS: Record<string, { label: string; category: string }> = {
  DAILYWAGES: { label: "Daily wages", category: "WAGES" },
  TRANSPORT: { label: "Auto, transport or delivery", category: "TRANSPORT" },
  PACKING: { label: "Packing material", category: "PACKING" },
  REPAIR: { label: "Repairs and fixing", category: "MAINTENANCE" },
  SUPPLIES: { label: "Shop supplies (stationery, cleaning)", category: "OFFICE_SUPPLIES" },
  PHONE: { label: "Phone or internet", category: "INTERNET_PHONE" },
  ADVERT: { label: "Advertising", category: "MARKETING" },
  OTHER: { label: "Something else (tea, small items)", category: "MISCELLANEOUS" },
};

