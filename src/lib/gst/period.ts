import "server-only";

/** GST figures for a return period, read from the records (sums and tables in returns.ts). */
import type { Pool, RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { getBalanceReport } from "@/lib/reports/report-data";
import { addDays, toPaise } from "@/lib/reports/money";
import { ACCOUNT } from "@/lib/ledger/posting-rules";
import { compositionTax, setOff, taxInside, ZERO_TAX, type TaxSplit } from "./engine";
import { buildGstr1, buildGstr3b, type CreditNoteRec, type InvoiceRec, type InwardRec, type RateRow } from "./returns";
import { loadGstConfig, type GstConfig } from "./data";

type Row = RowDataPacket & Record<string, string | number | null>;

async function rows(sql: string, params: unknown[]): Promise<Row[]> {
  try {
    const [r] = await (db as Pool).query<Row[]>(sql, params);
    return r;
  } catch (e) {
    if (isMissingColumn(e) || isMissingTable(e)) return [];
    throw e;
  }
}

const tax = (r: Row, p = ""): TaxSplit => ({ cgst: toPaise(r[`${p}cgst`]), sgst: toPaise(r[`${p}sgst`]), igst: toPaise(r[`${p}igst`]) });

export async function gstReady(): Promise<boolean> {
  try {
    await db.query(`SELECT 1 FROM acct_gst_payments LIMIT 1`);
    return true;
  } catch (e) {
    if (isMissingTable(e)) return false;
    throw e;
  }
}

/** Every GST bill and credit note of a period, as return records. */
async function outward(businessId: number, from: string, to: string, cfg: GstConfig) {
  const heads = await rows(
    `SELECT s.id, s.invoice_no, DATE_FORMAT(s.invoice_date, '%Y-%m-%d') AS d, s.buyer_gstin, COALESCE(s.customer_name, '') AS customer_name,
            s.place_of_supply, s.grand_total, s.shipping_charge, s.shipping_gst_rate, s.shipping_cgst AS ship_cgst, s.shipping_sgst AS ship_sgst, s.shipping_igst AS ship_igst
       FROM acct_sales_headers s
      WHERE s.legal_business_id = ? AND s.status = 'POSTED' AND s.gst_applied = 1 AND s.invoice_date BETWEEN ? AND ?
      ORDER BY s.invoice_date, s.id`,
    [businessId, from, to]
  );
  const lineRows = heads.length
    ? await rows(
        `SELECT sale_id, hsn_code, gst_rate, taxable_value, quantity, cgst_amount AS cgst, sgst_amount AS sgst, igst_amount AS igst
           FROM acct_sales_lines WHERE legal_business_id = ? AND sale_id IN (${heads.map(() => "?").join(",")})`,
        [businessId, ...heads.map((h) => h.id)]
      )
    : [];
  const bySale = new Map<number, RateRow[]>();
  for (const l of lineRows) {
    const list = bySale.get(Number(l.sale_id)) ?? [];
    list.push({ rate: Number(l.gst_rate ?? 0), taxable: toPaise(l.taxable_value), hsn: l.hsn_code ? String(l.hsn_code) : null, qty: Number(l.quantity), ...tax(l) });
    bySale.set(Number(l.sale_id), list);
  }
  const invoices: InvoiceRec[] = heads.map((h) => {
    const list = bySale.get(Number(h.id)) ?? [];
    const ship = toPaise(h.shipping_charge);
    if (ship > 0n) {
      const t = tax(h, "ship_");
      list.push({ rate: Number(h.shipping_gst_rate ?? 0), taxable: ship - t.cgst - t.sgst - t.igst, hsn: null, qty: 0, ...t });
    }
    return {
      no: String(h.invoice_no),
      date: String(h.d),
      buyerGstin: h.buyer_gstin ? String(h.buyer_gstin) : null,
      buyerName: String(h.customer_name),
      pos: String(h.place_of_supply || cfg.stateCode),
      value: toPaise(h.grand_total),
      rows: list,
    };
  });

  const notes = await rows(
    `SELECT r.id, r.return_no, DATE_FORMAT(r.return_date, '%Y-%m-%d') AS d, s.invoice_no, DATE_FORMAT(s.invoice_date, '%Y-%m-%d') AS inv_d,
            s.buyer_gstin, COALESCE(s.customer_name, '') AS customer_name, s.place_of_supply, s.shipping_gst_rate, r.refund_value, r.delivery_value, r.delivery_tax,
            r.cgst_amount AS cgst, r.sgst_amount AS sgst, r.igst_amount AS igst
       FROM acct_sales_returns r JOIN acct_sales_headers s ON s.id = r.sale_id AND s.legal_business_id = r.legal_business_id
      WHERE r.legal_business_id = ? AND r.status = 'POSTED' AND s.gst_applied = 1 AND r.return_date BETWEEN ? AND ?
      ORDER BY r.return_date, r.id`,
    [businessId, from, to]
  );
  const noteLines = notes.length
    ? await rows(
        `SELECT rl.return_id, rl.refund_value, rl.quantity, sl.gst_rate, sl.hsn_code
           FROM acct_sales_return_lines rl JOIN acct_sales_lines sl ON sl.id = rl.sale_line_id AND sl.legal_business_id = rl.legal_business_id
          WHERE rl.legal_business_id = ? AND rl.return_id IN (${notes.map(() => "?").join(",")})`,
        [businessId, ...notes.map((n) => n.id)]
      )
    : [];
  const creditNotes: CreditNoteRec[] = notes.map((n) => {
    const same = String(n.place_of_supply || cfg.stateCode) === cfg.stateCode;
    const mine = noteLines.filter((l) => Number(l.return_id) === Number(n.id));
    // Each line's share of the note's tax, by its rate (the note total is what the books hold).
    const list: RateRow[] = mine.map((l) => {
      const refund = toPaise(l.refund_value);
      const rate = Number(l.gst_rate ?? 0);
      const t = taxInside(refund, rate).tax;
      const half = t / 2n;
      return { rate, taxable: refund - t, hsn: l.hsn_code ? String(l.hsn_code) : null, qty: Number(l.quantity), cgst: same ? half : 0n, sgst: same ? t - half : 0n, igst: same ? 0n : t };
    });
    const delivery = toPaise(n.delivery_value);
    if (delivery > 0n) {
      const dt = toPaise(n.delivery_tax);
      const half = dt / 2n;
      list.push({ rate: Number(n.shipping_gst_rate ?? 0), taxable: delivery - dt, hsn: null, qty: 0, cgst: same ? half : 0n, sgst: same ? dt - half : 0n, igst: same ? 0n : dt });
    }
    // Keep the rows equal to the tax saved on the note (any paisa difference goes on the first row).
    const saved = tax(n);
    const sum = list.reduce((t, r) => ({ cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst, igst: t.igst + r.igst }), { ...ZERO_TAX });
    if (list[0]) {
      list[0] = { ...list[0], cgst: list[0].cgst + saved.cgst - sum.cgst, sgst: list[0].sgst + saved.sgst - sum.sgst, igst: list[0].igst + saved.igst - sum.igst };
    }
    return {
      no: String(n.return_no),
      date: String(n.d),
      invoiceNo: String(n.invoice_no),
      invoiceDate: String(n.inv_d),
      buyerGstin: n.buyer_gstin ? String(n.buyer_gstin) : null,
      buyerName: String(n.customer_name),
      pos: String(n.place_of_supply || cfg.stateCode),
      value: toPaise(n.refund_value),
      rows: list,
    };
  });
  return { invoices, creditNotes };
}

/** Purchases, expenses and supplier returns of a period, for input credit and reverse charge. */
async function inward(businessId: number, from: string, to: string): Promise<InwardRec[]> {
  const out: InwardRec[] = [];
  const purchases = await rows(
    `SELECT h.gst_treatment, COALESCE(SUM(l.line_amount), 0) AS amount,
            COALESCE(SUM(CASE WHEN l.itc_eligible = 1 THEN l.cgst_amount ELSE 0 END), 0) AS cgst,
            COALESCE(SUM(CASE WHEN l.itc_eligible = 1 THEN l.sgst_amount ELSE 0 END), 0) AS sgst,
            COALESCE(SUM(CASE WHEN l.itc_eligible = 1 THEN l.igst_amount ELSE 0 END), 0) AS igst
       FROM acct_purchase_headers h JOIN acct_purchase_lines l ON l.purchase_id = h.id AND l.legal_business_id = h.legal_business_id
      WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.gst_treatment <> 'NONE' AND h.invoice_date BETWEEN ? AND ?
      GROUP BY h.gst_treatment`,
    [businessId, from, to]
  );
  for (const p of purchases) {
    const credit = tax(p);
    out.push({ kind: "PURCHASE", treatment: String(p.gst_treatment) as InwardRec["treatment"], value: toPaise(p.amount) - credit.cgst - credit.sgst - credit.igst, credit, rcm: { ...ZERO_TAX } });
  }
  const returns = await rows(
    `SELECT COALESCE(SUM(itc_cgst), 0) AS cgst, COALESCE(SUM(itc_sgst), 0) AS sgst, COALESCE(SUM(itc_igst), 0) AS igst, COALESCE(SUM(cost_value), 0) AS value
       FROM acct_supplier_returns WHERE legal_business_id = ? AND status = 'POSTED' AND return_date BETWEEN ? AND ?
        AND (itc_cgst + itc_sgst + itc_igst) > 0`,
    [businessId, from, to]
  );
  for (const r of returns) {
    const c = tax(r);
    if (c.cgst + c.sgst + c.igst > 0n) out.push({ kind: "SUPPLIER_RETURN", treatment: "REGULAR", value: -toPaise(r.value), credit: { cgst: -c.cgst, sgst: -c.sgst, igst: -c.igst }, rcm: { ...ZERO_TAX } });
  }
  const expenses = await rows(
    `SELECT gst_mode, COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(cgst_amount), 0) AS cgst, COALESCE(SUM(sgst_amount), 0) AS sgst, COALESCE(SUM(igst_amount), 0) AS igst
       FROM acct_expenses WHERE legal_business_id = ? AND status = 'CONFIRMED' AND gst_mode <> 'NONE' AND expense_date BETWEEN ? AND ?
      GROUP BY gst_mode`,
    [businessId, from, to]
  );
  for (const e of expenses) {
    const t = tax(e);
    const total = t.cgst + t.sgst + t.igst;
    if (String(e.gst_mode) === "RCM") out.push({ kind: "EXPENSE", treatment: "RCM", value: toPaise(e.amount), credit: t, rcm: t });
    else out.push({ kind: "EXPENSE", treatment: "REGULAR", value: toPaise(e.amount) - total, credit: t, rcm: { ...ZERO_TAX } });
  }
  return out;
}

/** Input credit left in the books at the start of the period (the GST input accounts). */
async function creditAtStart(businessId: number, from: string): Promise<TaxSplit> {
  const report = await getBalanceReport(db as Pool, businessId, addDays(from, -1));
  const bal = (code: string) => report.accounts.filter((a) => a.standard === code).reduce((t, a) => t + a.debit - a.credit, 0n);
  const v = (code: string) => {
    const b = bal(code);
    return b > 0n ? b : 0n;
  };
  return { cgst: v(ACCOUNT.GST_INPUT_CGST), sgst: v(ACCOUNT.GST_INPUT_SGST), igst: v(ACCOUNT.GST_INPUT_IGST) };
}

export async function gstPeriod(businessId: number, from: string, to: string) {
  const cfg = await loadGstConfig(db, businessId);
  const { invoices, creditNotes } = await outward(businessId, from, to, cfg);
  const gstr1 = buildGstr1({ homeState: cfg.stateCode, invoices, creditNotes });
  const inwardRecs = await inward(businessId, from, to);
  const broughtForward = await creditAtStart(businessId, from);
  const gstr3b = buildGstr3b({ gstr1, homeState: cfg.stateCode, inward: inwardRecs, creditBroughtForward: broughtForward });

  // Composition: turnover of bills of supply less goods taken back.
  const comp = await rows(
    `SELECT COALESCE(SUM(grand_total), 0) AS sales FROM acct_sales_headers
      WHERE legal_business_id = ? AND status = 'POSTED' AND invoice_kind = 'BILL_OF_SUPPLY' AND invoice_date BETWEEN ? AND ?`,
    [businessId, from, to]
  );
  const compReturns = await rows(
    `SELECT COALESCE(SUM(r.refund_value), 0) AS back FROM acct_sales_returns r JOIN acct_sales_headers s ON s.id = r.sale_id AND s.legal_business_id = r.legal_business_id
      WHERE r.legal_business_id = ? AND r.status = 'POSTED' AND s.invoice_kind = 'BILL_OF_SUPPLY' AND r.return_date BETWEEN ? AND ?`,
    [businessId, from, to]
  );
  const compTurnover = toPaise(comp[0]?.sales ?? 0) - toPaise(compReturns[0]?.back ?? 0);
  const compositionDue = compositionTax(compTurnover > 0n ? compTurnover : 0n, cfg.compositionRate);
  const inwardFromRegistered = inwardRecs.filter((r) => r.kind === "PURCHASE" && r.treatment !== "UNREGISTERED").reduce((t, r) => t + r.value, 0n);
  const inwardFromUnregistered = inwardRecs.filter((r) => r.treatment === "UNREGISTERED").reduce((t, r) => t + r.value, 0n);

  const missing = await rows(
    `SELECT COUNT(*) AS n FROM acct_sales_lines l JOIN acct_sales_headers s ON s.id = l.sale_id AND s.legal_business_id = l.legal_business_id
      WHERE s.legal_business_id = ? AND s.status = 'POSTED' AND s.gst_applied = 1 AND s.invoice_date BETWEEN ? AND ? AND (l.gst_rate IS NULL OR l.gst_rate = 0) AND l.hsn_code IS NULL`,
    [businessId, from, to]
  );
  const payments = await rows(
    `SELECT id, payment_no, scheme, DATE_FORMAT(period_from, '%Y-%m-%d') AS f, DATE_FORMAT(period_to, '%Y-%m-%d') AS t, DATE_FORMAT(paid_on, '%Y-%m-%d') AS d,
            cash_total, challan_ref FROM acct_gst_payments WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY period_from DESC, id DESC LIMIT 24`,
    [businessId]
  );
  return {
    cfg,
    gstr1,
    gstr3b,
    broughtForward,
    composition: { turnover: compTurnover, tax: compositionDue, inwardFromRegistered, inwardFromUnregistered, rcm: gstr3b.rcmInward },
    missingRates: Number(missing[0]?.n ?? 0),
    payments: payments.map((p) => ({ id: Number(p.id), no: String(p.payment_no), scheme: String(p.scheme), from: String(p.f), to: String(p.t), paidOn: String(p.d), cash: toPaise(p.cash_total), ref: String(p.challan_ref ?? "") })),
    alreadyPaid: payments.some((p) => String(p.f) === from && String(p.t) === to),
  };
}

/** What a payment for the period settles (regular scheme), from the period's figures. */
export function paymentFigures(p: Awaited<ReturnType<typeof gstPeriod>>) {
  const pos = (x: bigint) => (x > 0n ? x : 0n);
  const owed = { cgst: pos(p.gstr3b.outward.cgst), sgst: pos(p.gstr3b.outward.sgst), igst: pos(p.gstr3b.outward.igst) };
  const so = setOff(owed, p.gstr3b.itcTotal);
  const used = {
    cgst: so.used.cgst.cgst + so.used.cgst.igst,
    sgst: so.used.sgst.sgst + so.used.sgst.igst,
    igst: so.used.igst.igst + so.used.igst.cgst + so.used.igst.sgst,
  };
  const rcm = p.gstr3b.rcmCash;
  return { settled: owed, used, cash: so.cash, rcm, creditLeft: so.creditLeft };
}
