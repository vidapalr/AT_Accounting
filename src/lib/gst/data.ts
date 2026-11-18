import "server-only";

/**
 * GST on stored records: works out and saves the tax on a bill, a supplier's bill, a customer
 * return, a supplier return and an expense, from the company's GST settings. The sums are in
 * engine.ts (pure). While the company is not registered, or before the GST start date, nothing is
 * written and every record stays exactly as before.
 */
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { isMissingColumn } from "@/lib/db-errors";
import { stateFromGstin, GSTIN_PATTERN, GST_STATES } from "@/lib/gst";
import { toPaise } from "@/lib/reports/money";
import { creditShare, expenseTax, purchaseTax, purchaseTreatment, returnTax, saleTax, taxTotal, ZERO_TAX, type GstScheme, type RateRule, type TaxSplit } from "./engine";

type Conn = Pool | PoolConnection;
type Row = RowDataPacket & Record<string, string | number | null>;

const money = (p: bigint) => {
  const neg = p < 0n;
  const a = neg ? -p : p;
  return `${neg ? "-" : ""}${a / 100n}.${String(a % 100n).padStart(2, "0")}`;
};
const rateOf = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

export type GstConfig = {
  scheme: GstScheme;
  gstin: string;
  stateCode: string;
  effectiveDate: string;
  compositionRate: number;
};

export async function loadGstConfig(conn: Conn, businessId: number): Promise<GstConfig> {
  const [rows] = await conn.query<Row[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key LIKE 'gst\\_%'`,
    [businessId]
  );
  const s = Object.fromEntries(rows.map((r) => [String(r.setting_key), String(r.setting_value ?? "")]));
  const scheme = (["REGULAR", "COMPOSITION"].includes(s.gst_status) ? s.gst_status : "NOT_REGISTERED") as GstScheme;
  const rate = Number(s.gst_composition_rate);
  return {
    scheme,
    gstin: s.gst_gstin ?? "",
    stateCode: s.gst_state_code || (s.gst_gstin ?? "").slice(0, 2),
    effectiveDate: s.gst_effective_date ?? "",
    compositionRate: Number.isFinite(rate) && rate > 0 ? rate : 1,
  };
}

/** The scheme that applies to a record dated `date` (not registered before the GST start date). */
export function schemeOn(cfg: GstConfig, date: string): GstScheme {
  if (cfg.scheme === "NOT_REGISTERED" || !cfg.effectiveDate || date < cfg.effectiveDate) return "NOT_REGISTERED";
  return cfg.scheme;
}

export const cleanGstin = (v: unknown): string | null => {
  const g = String(v ?? "").trim().toUpperCase();
  return GSTIN_PATTERN.test(g) ? g : null;
};

function ruleOf(r: Row): RateRule {
  return {
    rate: rateOf(r.gst_rate),
    highRate: rateOf(r.gst_rate_high),
    limit: r.gst_price_limit === null || r.gst_price_limit === undefined ? null : toPaise(r.gst_price_limit),
  };
}

/**
 * Work out and save the GST on a bill (call after its lines are saved, in the same transaction).
 * Prices include GST, so the bill total never changes; only the split into value and tax is saved.
 */
export async function applySaleGst(
  conn: Conn,
  businessId: number,
  saleId: number,
  buyer?: { gstin: string | null; stateCode: string | null }
): Promise<{ missingRate: number } | null> {
  if (buyer && (buyer.gstin || buyer.stateCode)) {
    // Typed on the bill: the buyer's GSTIN (a business) or the state the goods go to.
    await conn
      .execute(`UPDATE acct_sales_headers SET buyer_gstin = ?, place_of_supply = COALESCE(?, place_of_supply) WHERE id = ? AND legal_business_id = ?`, [
        cleanGstin(buyer.gstin),
        buyer.stateCode,
        saleId,
        businessId,
      ])
      .catch((e) => {
        if (!isMissingColumn(e)) throw e;
      });
  }
  const [heads] = await conn.query<Row[]>(
    `SELECT h.id, DATE_FORMAT(h.invoice_date, '%Y-%m-%d') AS d, h.discount_amount, h.shipping_charge, h.gst_applied,
            h.place_of_supply, h.buyer_gstin, c.gstin AS customer_gstin
       FROM acct_sales_headers h
       LEFT JOIN acct_customers c ON c.id = h.customer_id AND c.legal_business_id = h.legal_business_id
      WHERE h.id = ? AND h.legal_business_id = ?`,
    [saleId, businessId]
  ).catch((e) => {
    if (isMissingColumn(e)) return [[] as Row[]] as const; // migration 090 not run: GST stays off
    throw e;
  });
  const head = heads[0];
  if (!head) return null;
  const cfg = await loadGstConfig(conn, businessId);
  const scheme = schemeOn(cfg, String(head.d));
  if (scheme === "NOT_REGISTERED" && Number(head.gst_applied) === 0) return null;

  const [lines] = await conn.query<Row[]>(
    `SELECT l.id, l.quantity, l.discount_amount, l.line_total, p.hsn_code, p.gst_rate, p.gst_rate_high, p.gst_price_limit
       FROM acct_sales_lines l
       JOIN acct_product_variants v ON v.id = l.variant_id AND v.legal_business_id = l.legal_business_id
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE l.sale_id = ? AND l.legal_business_id = ?
      ORDER BY l.id`,
    [saleId, businessId]
  );
  const buyerGstin = cleanGstin(head.buyer_gstin) ?? cleanGstin(head.customer_gstin);
  if (buyerGstin && !cleanGstin(head.customer_gstin)) {
    // Remember a GSTIN typed on the bill on the customer, so the next bill picks it up.
    await conn.execute(
      `UPDATE acct_customers c JOIN acct_sales_headers h ON h.customer_id = c.id AND h.legal_business_id = c.legal_business_id
          SET c.gstin = ? WHERE h.id = ? AND h.legal_business_id = ? AND (c.gstin IS NULL OR c.gstin = '')`,
      [buyerGstin, saleId, businessId]
    );
  }
  const pos = (buyerGstin ? stateFromGstin(buyerGstin)?.code : null) ?? (String(head.place_of_supply ?? "") || cfg.stateCode);
  const lineDiscounts = lines.reduce((t, l) => t + toPaise(l.discount_amount), 0n);
  const billDiscount = toPaise(head.discount_amount) - lineDiscounts;
  const t = saleTax({
    scheme,
    sameState: pos === cfg.stateCode,
    billDiscount: billDiscount > 0n ? billDiscount : 0n,
    shipping: toPaise(head.shipping_charge),
    lines: lines.map((l) => ({ lineTotal: toPaise(l.line_total), qtyMilli: BigInt(Math.round(Number(l.quantity) * 1000)), rule: ruleOf(l), hsn: l.hsn_code ? String(l.hsn_code) : null })),
  });
  const applied = scheme === "REGULAR" ? 1 : 0;
  for (const [i, l] of lines.entries()) {
    const x = t.lines[i];
    await conn.execute(
      `UPDATE acct_sales_lines SET hsn_code = ?, gst_rate = ?, taxable_value = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?
        WHERE id = ? AND legal_business_id = ?`,
      [x.hsn, applied ? x.rate : null, applied ? money(x.taxable) : null, money(x.cgst), money(x.sgst), money(x.igst), l.id, businessId]
    );
  }
  await conn.execute(
    `UPDATE acct_sales_headers SET gst_applied = ?, invoice_kind = ?, buyer_gstin = ?, place_of_supply = ?,
            shipping_gst_rate = ?, shipping_cgst = ?, shipping_sgst = ?, shipping_igst = ?
      WHERE id = ? AND legal_business_id = ?`,
    [applied, t.kind, applied ? buyerGstin : null, scheme === "NOT_REGISTERED" ? head.place_of_supply : pos,
     applied ? t.shipping.rate : null, money(t.shipping.cgst), money(t.shipping.sgst), money(t.shipping.igst), saleId, businessId]
  );
  return { missingRate: t.missingRate };
}

/** GST given back on a customer return (call after its lines are saved). */
export async function applySalesReturnGst(conn: Conn, businessId: number, returnId: number): Promise<void> {
  const [heads] = await conn.query<Row[]>(
    `SELECT r.id, r.delivery_value, s.gst_applied, s.place_of_supply, s.shipping_gst_rate
       FROM acct_sales_returns r JOIN acct_sales_headers s ON s.id = r.sale_id AND s.legal_business_id = r.legal_business_id
      WHERE r.id = ? AND r.legal_business_id = ?`,
    [returnId, businessId]
  ).catch((e) => {
    if (isMissingColumn(e)) return [[] as Row[]] as const;
    throw e;
  });
  const head = heads[0];
  if (!head || Number(head.gst_applied) !== 1) return;
  const cfg = await loadGstConfig(conn, businessId);
  const [lines] = await conn.query<Row[]>(
    `SELECT rl.refund_value, sl.gst_rate FROM acct_sales_return_lines rl
       JOIN acct_sales_lines sl ON sl.id = rl.sale_line_id AND sl.legal_business_id = rl.legal_business_id
      WHERE rl.return_id = ? AND rl.legal_business_id = ?`,
    [returnId, businessId]
  );
  const t = returnTax({
    sameState: String(head.place_of_supply ?? cfg.stateCode) === cfg.stateCode,
    lines: lines.map((l) => ({ refund: toPaise(l.refund_value), rate: Number(l.gst_rate ?? 0) })),
    delivery: toPaise(head.delivery_value),
    deliveryRate: Number(head.shipping_gst_rate ?? 0),
  });
  await conn.execute(
    `UPDATE acct_sales_returns SET cgst_amount = ?, sgst_amount = ?, igst_amount = ?, delivery_tax = ? WHERE id = ? AND legal_business_id = ?`,
    [money(t.goods.cgst + t.delivery.cgst), money(t.goods.sgst + t.delivery.sgst), money(t.goods.igst + t.delivery.igst), money(taxTotal(t.delivery)), returnId, businessId]
  );
}

/**
 * Work out and save the GST inside a supplier's bill (call after its lines are saved). Line amounts
 * stay what the supplier billed (GST included); with a regular GST supplier the tax becomes input
 * credit and the stock is valued without it.
 */
export async function applyPurchaseGst(conn: Conn, businessId: number, purchaseId: number): Promise<void> {
  const [heads] = await conn.query<Row[]>(
    `SELECT h.id, DATE_FORMAT(h.invoice_date, '%Y-%m-%d') AS d, h.gst_treatment, h.bill_tax_total, s.gstin, s.gst_composition
       FROM acct_purchase_headers h JOIN acct_suppliers s ON s.id = h.supplier_id AND s.legal_business_id = h.legal_business_id
      WHERE h.id = ? AND h.legal_business_id = ?`,
    [purchaseId, businessId]
  ).catch((e) => {
    if (isMissingColumn(e)) return [[] as Row[]] as const;
    throw e;
  });
  const head = heads[0];
  if (!head) return;
  const cfg = await loadGstConfig(conn, businessId);
  const scheme = schemeOn(cfg, String(head.d));
  if (scheme === "NOT_REGISTERED" && String(head.gst_treatment) === "NONE") return;
  const gstin = cleanGstin(head.gstin);
  const treatment = purchaseTreatment({ scheme, supplierGstin: gstin, supplierComposition: Number(head.gst_composition) === 1 });
  const [lines] = await conn.query<Row[]>(
    `SELECT l.id, l.quantity, l.line_amount, p.hsn_code, p.gst_rate, p.gst_rate_high, p.gst_price_limit
       FROM acct_purchase_lines l
       JOIN acct_product_variants v ON v.id = l.variant_id AND v.legal_business_id = l.legal_business_id
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE l.purchase_id = ? AND l.legal_business_id = ? ORDER BY l.line_no`,
    [purchaseId, businessId]
  );
  const t = purchaseTax({
    treatment,
    sameState: !gstin || gstin.slice(0, 2) === cfg.stateCode,
    billTax: head.bill_tax_total === null ? null : toPaise(head.bill_tax_total),
    lines: lines.map((l) => ({ amount: toPaise(l.line_amount), qtyMilli: BigInt(Math.round(Number(l.quantity) * 1000)), rule: ruleOf(l) })),
  });
  for (const [i, l] of lines.entries()) {
    const x = t.lines[i];
    await conn.execute(
      `UPDATE acct_purchase_lines SET hsn_code = ?, gst_rate = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?, itc_eligible = ?
        WHERE id = ? AND legal_business_id = ?`,
      [l.hsn_code, treatment === "REGULAR" ? x.rate : null, money(x.cgst), money(x.sgst), money(x.igst), treatment === "REGULAR" ? 1 : 0, l.id, businessId]
    );
  }
  await conn.execute(
    `UPDATE acct_purchase_headers SET gst_treatment = ?, supplier_gstin = ? WHERE id = ? AND legal_business_id = ?`,
    [treatment, gstin, purchaseId, businessId]
  );
}

export type ExpenseGstInput = { mode: "NONE" | "ITC" | "RCM"; vendorGstin: string | null; rate: number | null; typedTax: bigint | null };

/** Read the GST boxes of the expense form. "bad" = something typed wrongly. */
export function readExpenseGst(form: FormData): ExpenseGstInput | "bad" {
  const mode = String(form.get("gst_mode") ?? "NONE");
  if (mode !== "ITC" && mode !== "RCM") return { mode: "NONE", vendorGstin: null, rate: null, typedTax: null };
  const typedGstin = String(form.get("vendor_gstin") ?? "").trim();
  const vendorGstin = typedGstin ? cleanGstin(typedGstin) : null;
  const rate = Number(String(form.get("gst_rate") ?? ""));
  const taxText = String(form.get("gst_amount") ?? "").trim();
  const typedTax = taxText ? toPaise(taxText.replace(/,/g, "")) : null;
  if ((typedGstin && !vendorGstin) || !Number.isFinite(rate) || rate < 0 || rate > 40 || (mode === "ITC" && !vendorGstin) || (typedTax !== null && typedTax < 0n)) return "bad";
  return { mode, vendorGstin, rate, typedTax };
}

/**
 * GST on an expense: input credit inside a registered vendor's bill, or reverse charge (the business
 * pays the GST itself, e.g. rent from an unregistered owner or a goods transport agency).
 */
export async function applyExpenseGst(conn: Conn, businessId: number, expenseId: number, date: string, amount: bigint, input: ExpenseGstInput): Promise<void> {
  if (input.mode === "NONE") return;
  const cfg = await loadGstConfig(conn, businessId);
  if (schemeOn(cfg, date) !== "REGULAR") return;
  const sameState = !input.vendorGstin || input.vendorGstin.slice(0, 2) === cfg.stateCode;
  const t = expenseTax({ mode: input.mode, amount, rate: input.rate ?? 0, sameState, typedTax: input.typedTax });
  await conn.execute(
    `UPDATE acct_expenses SET gst_mode = ?, vendor_gstin = ?, gst_rate = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ? WHERE id = ? AND legal_business_id = ?`,
    [input.mode, input.vendorGstin, input.rate, money(t.cgst), money(t.sgst), money(t.igst), expenseId, businessId]
  );
}

/** Input credit on purchase lines (zero unless the line carries input credit). */
export async function purchaseLineCredits(conn: Conn, businessId: number, lineIds: number[]): Promise<Map<number, { amount: bigint; credit: TaxSplit }>> {
  const out = new Map<number, { amount: bigint; credit: TaxSplit }>();
  if (lineIds.length === 0) return out;
  const [rows] = await conn.query<Row[]>(
    `SELECT id, line_amount, cgst_amount, sgst_amount, igst_amount, itc_eligible FROM acct_purchase_lines
      WHERE legal_business_id = ? AND id IN (${lineIds.map(() => "?").join(",")})`,
    [businessId, ...lineIds]
  );
  for (const r of rows) {
    const eligible = Number(r.itc_eligible) === 1;
    out.set(Number(r.id), {
      amount: toPaise(r.line_amount),
      credit: eligible ? { cgst: toPaise(r.cgst_amount), sgst: toPaise(r.sgst_amount), igst: toPaise(r.igst_amount) } : { ...ZERO_TAX },
    });
  }
  return out;
}

/** Stock value of a purchase line: what was billed less any input credit. */
export function netCost(amount: bigint, credit: TaxSplit): bigint {
  return amount - taxTotal(credit);
}

/** Share of a purchase line's input credit for part of it (returns, edits). */
export { creditShare, money as gstMoney };

export type InvoiceGst = {
  kind: "PLAIN" | "TAX_INVOICE" | "BILL_OF_SUPPLY";
  sellerGstin: string;
  buyerGstin: string | null;
  placeOfSupply: { code: string; name: string } | null;
  interState: boolean;
  rows: Array<{ hsn: string; rate: number; taxable: bigint; cgst: bigint; sgst: bigint; igst: bigint }>;
  total: { taxable: bigint; cgst: bigint; sgst: bigint; igst: bigint };
  /** GST inside the goods only (without the delivery charge). */
  goodsTax: bigint;
};

/** GST details printed on a bill: kind of bill, GSTINs, place of supply and the tax by HSN and rate. */
export async function loadInvoiceGst(conn: Conn, businessId: number, saleId: number): Promise<InvoiceGst | null> {
  let head: Row | undefined;
  try {
    const [h] = await conn.query<Row[]>(
      `SELECT invoice_kind, buyer_gstin, place_of_supply, shipping_gst_rate, shipping_charge, shipping_cgst, shipping_sgst, shipping_igst
         FROM acct_sales_headers WHERE id = ? AND legal_business_id = ?`,
      [saleId, businessId]
    );
    head = h[0];
  } catch (e) {
    if (isMissingColumn(e)) return null;
    throw e;
  }
  if (!head || head.invoice_kind === "PLAIN") return null;
  const cfg = await loadGstConfig(conn, businessId);
  const pos = GST_STATES.find((st) => st.code === String(head!.place_of_supply ?? "")) ?? null;
  const [lines] = await conn.query<Row[]>(
    `SELECT hsn_code, gst_rate, taxable_value, cgst_amount, sgst_amount, igst_amount FROM acct_sales_lines WHERE sale_id = ? AND legal_business_id = ?`,
    [saleId, businessId]
  );
  const map = new Map<string, InvoiceGst["rows"][number]>();
  const addRow = (hsn: string, rate: number, taxable: bigint, cgst: bigint, sgst: bigint, igst: bigint) => {
    const key = `${hsn}|${rate}`;
    const cur = map.get(key) ?? { hsn, rate, taxable: 0n, cgst: 0n, sgst: 0n, igst: 0n };
    map.set(key, { hsn, rate, taxable: cur.taxable + taxable, cgst: cur.cgst + cgst, sgst: cur.sgst + sgst, igst: cur.igst + igst });
  };
  for (const l of lines) {
    addRow(String(l.hsn_code ?? "—"), Number(l.gst_rate ?? 0), toPaise(l.taxable_value), toPaise(l.cgst_amount), toPaise(l.sgst_amount), toPaise(l.igst_amount));
  }
  const goodsTax = [...map.values()].reduce((t, r) => t + r.cgst + r.sgst + r.igst, 0n);
  const shipTax = toPaise(head.shipping_cgst) + toPaise(head.shipping_sgst) + toPaise(head.shipping_igst);
  if (toPaise(head.shipping_charge) > 0n && head.invoice_kind === "TAX_INVOICE") {
    addRow("9965 (delivery)", Number(head.shipping_gst_rate ?? 0), toPaise(head.shipping_charge) - shipTax, toPaise(head.shipping_cgst), toPaise(head.shipping_sgst), toPaise(head.shipping_igst));
  }
  const rows = [...map.values()];
  const total = rows.reduce((t, r) => ({ taxable: t.taxable + r.taxable, cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst, igst: t.igst + r.igst }), { taxable: 0n, cgst: 0n, sgst: 0n, igst: 0n });
  return {
    kind: String(head.invoice_kind) as InvoiceGst["kind"],
    sellerGstin: cfg.gstin,
    buyerGstin: head.buyer_gstin ? String(head.buyer_gstin) : null,
    placeOfSupply: pos,
    interState: !!pos && pos.code !== cfg.stateCode,
    rows,
    total,
    goodsTax,
  };
}
