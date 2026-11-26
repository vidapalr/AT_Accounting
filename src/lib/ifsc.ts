/** IFSC codes (pure): the first 4 letters name the bank, so the bank name can be filled in for the person. */

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const BANKS: Record<string, string> = {
  SBIN: "State Bank of India", HDFC: "HDFC Bank", ICIC: "ICICI Bank", UTIB: "Axis Bank", KKBK: "Kotak Mahindra Bank",
  PUNB: "Punjab National Bank", BARB: "Bank of Baroda", CNRB: "Canara Bank", UBIN: "Union Bank of India", IDIB: "Indian Bank",
  IOBA: "Indian Overseas Bank", BKID: "Bank of India", MAHB: "Bank of Maharashtra", CBIN: "Central Bank of India", UCBA: "UCO Bank",
  PSIB: "Punjab & Sind Bank", YESB: "Yes Bank", INDB: "IndusInd Bank", IDFB: "IDFC First Bank", FDRL: "Federal Bank",
  KVBL: "Karur Vysya Bank", TMBL: "Tamilnad Mercantile Bank", CIUB: "City Union Bank", SIBL: "South Indian Bank", KARB: "Karnataka Bank",
  RATN: "RBL Bank", AUBL: "AU Small Finance Bank", ESFB: "Equitas Small Finance Bank", UJVN: "Ujjivan Small Finance Bank",
  APGV: "Andhra Pradesh Grameena Vikas Bank", APGB: "Andhra Pragathi Grameena Bank", TGMB: "Telangana Grameena Bank",
  DBSS: "DBS Bank India", HSBC: "HSBC", SCBL: "Standard Chartered", CITI: "Citibank", BDBL: "Bandhan Bank", DLXB: "Dhanlaxmi Bank",
  JAKA: "Jammu & Kashmir Bank", IBKL: "IDBI Bank", AIRP: "Airtel Payments Bank", PYTM: "Paytm Payments Bank", IPOS: "India Post Payments Bank",
  FINO: "Fino Payments Bank", JSFB: "Jana Small Finance Bank", SURY: "Suryoday Small Finance Bank", UTKS: "Utkarsh Small Finance Bank",
};

export function normalIfsc(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

/** "SBIN0001234" -> "State Bank of India"; unknown or badly typed -> null. */
export function bankFromIfsc(raw: string): string | null {
  const code = normalIfsc(raw);
  if (!IFSC_PATTERN.test(code)) return null;
  return BANKS[code.slice(0, 4)] ?? null;
}
