import "server-only";

import type { Pool, RowDataPacket } from "mysql2/promise";

import { toPaise, inr, inrShort } from "@/lib/reports/money";
import { getAccountPositions, getCashByPlace, getExpenseBreakdown, getProfitReport } from "@/lib/reports/report-data";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import { allocate, buildSegments, formatUnits } from "@/lib/investor-shares/engine";
import { loadShares, profitLookupFor } from "@/lib/investor-shares/data";
import { cleanParam, reportPeriod, type ReportContent, type ReportType } from "./core";

type Row = RowDataPacket & Record<string, string | number | null>;

export type Place = { divisionId: number | null; branchId: number | null };

export type BuildInput = {
  db: Pool;
  businessId: number;
  type: ReportType;
  place: Place;
  /** The day the job runs (IST). */
  today: string;
  /** For investor statements. */
  investor?: { partyId: number; name: string } | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const fmtDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const fmtMonth = (key: string) => `${MONTH_FULL[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

const qty = (v: unknown) => Number(v ?? 0);
const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ""));

async function placeLabel(db: Pool, businessId: number, place: Place): Promise<string> {
  if (place.branchId !== null) {
    const [r] = await db.execute<Row[]>(`SELECT branch_name AS n FROM acct_branches WHERE legal_business_id = ? AND id = ?`, [businessId, place.branchId]);
    return `Branch: ${r[0]?.n ?? place.branchId}`;
  }
  if (place.divisionId !== null) {
    const [r] = await db.execute<Row[]>(`SELECT name AS n FROM acct_divisions WHERE legal_business_id = ? AND id = ?`, [businessId, place.divisionId]);
    return `Division: ${r[0]?.n ?? place.divisionId}`;
  }
  return "Whole group";
}

/** SQL for "this place" on a table that has division_id and branch_id columns. */
function scope(alias: string, place: Place): { sql: string; values: number[] } {
  if (place.branchId !== null) return { sql: ` AND ${alias}.branch_id = ?`, values: [place.branchId] };
  if (place.divisionId !== null) return { sql: ` AND ${alias}.division_id = ?`, values: [place.divisionId] };
  return { sql: "", values: [] };
}

async function pendingNote(db: Pool, businessId: number): Promise<string | undefined> {
  try {
    const s = await getSyncStatus(db, businessId);
    const n = s.pending.length;
    return n > 0 ? `${n} recent record(s) are not yet posted to the ledger, so profit figures may be lower than the final numbers.` : undefined;
  } catch {
    return undefined;
  }
}

export async function buildReport(input: BuildInput): Promise<ReportContent> {
  switch (input.type) {
    case "DAILY_SALES":
      return dailySales(input);
    case "DAILY_FULL":
      return dailyFull(input);
    case "STOCK_DAILY":
    case "STOCK_MONTHLY":
      return stockReport(input);
    case "ALERTS":
      return alerts(input);
    case "INVESTOR_STATEMENT":
      return investorStatement(input);
  }
}

async function dailySales({ db, businessId, place, today }: BuildInput): Promise<ReportContent> {
  const date = today;
  const label = await placeLabel(db, businessId, place);
  const lookup = await profitLookupFor(db, businessId, [{ from: date, to: date }]);
  const f = lookup(place, date, date);

  const s = scope("h", place);
  const [invoices] = await db.execute<Row[]>(
    `SELECT h.invoice_no, h.customer_name, h.grand_total FROM acct_sales_headers h
     WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.invoice_date = ?${s.sql}
     ORDER BY h.id`,
    [businessId, date, ...s.values]
  );
  const [methods] = await db.execute<Row[]>(
    `SELECT p.payment_method AS method, SUM(p.amount) AS total
     FROM acct_sales_payments p JOIN acct_sales_headers h ON h.id = p.sale_id AND h.legal_business_id = p.legal_business_id
     WHERE p.legal_business_id = ? AND p.status = 'RECORDED' AND p.payment_method NOT IN ('DISCOUNT','SET_OFF','EXCHANGE') AND h.status = 'POSTED' AND p.payment_date = ?${s.sql}
     GROUP BY p.payment_method ORDER BY total DESC`,
    [businessId, date, ...s.values]
  );
  const collected = methods.reduce((sum, r) => sum + toPaise(r.total), 0n);

  const scopes = await profitDetail(db, businessId, place, date, date);
  return {
    type: "DAILY_SALES",
    title: "Daily Sales Summary",
    subtitle: `${label} - ${fmtDate(date)}`,
    params: [fmtDate(date), label, String(invoices.length), inrShort(scopes.sales - scopes.discounts), inrShort(collected), inrShort(f.gross)].map((v) => cleanParam(v)),
    sections: [
      {
        heading: "Profit for the day",
        columns: ["", "Amount"],
        rows: [
          ["Sales", inr(scopes.sales)],
          ["Discounts and returns", inr(-scopes.discounts)],
          ["Cost of goods sold", inr(-scopes.costOfGoods)],
          ["Gross profit", inr(f.gross)],
        ],
      },
      {
        heading: "Money collected",
        columns: ["Method", "Amount"],
        rows: methods.length ? [...methods.map((m) => [String(m.method).replaceAll("_", " "), inr(toPaise(m.total))]), ["Total", inr(collected)]] : [["Nothing collected", "-"]],
      },
      {
        heading: "Invoices",
        columns: ["Invoice", "Customer", "Total"],
        rows: invoices.length ? invoices.map((r) => [String(r.invoice_no), String(r.customer_name ?? ""), inr(toPaise(r.grand_total))]) : [["No invoices today", "", ""]],
      },
    ],
    footnote: await pendingNote(db, businessId),
  };
}

async function profitDetail(db: Pool, businessId: number, place: Place, from: string, to: string) {
  const scopes = await getProfitReport(db, businessId, from, to);
  const hit = scopes.find((x) =>
    place.branchId !== null ? x.scope === "BRANCH" && x.branchId === place.branchId : place.divisionId !== null ? x.scope === "DIVISION" && x.divisionId === place.divisionId : x.scope === "GROUP"
  );
  const z = { sales: 0n, discounts: 0n, costOfGoods: 0n, gross: 0n, runningExpenses: 0n, operating: 0n, net: 0n };
  return hit ? { ...z, ...hit.figures } : z;
}

async function dailyFull({ db, businessId, place, today }: BuildInput): Promise<ReportContent> {
  const date = today;
  const monthStart = `${date.slice(0, 8)}01`;
  const label = await placeLabel(db, businessId, place);
  const day = await profitDetail(db, businessId, place, date, date);
  const mtd = await profitDetail(db, businessId, place, monthStart, date);

  const profitRows = (f: typeof day) => [
    ["Sales", inr(f.sales)],
    ["Discounts and returns", inr(-f.discounts)],
    ["Cost of goods sold", inr(-f.costOfGoods)],
    ["Gross profit", inr(f.gross)],
    ["Running expenses", inr(-f.runningExpenses)],
    ["Operating profit", inr(f.operating)],
    ["Net profit", inr(f.net)],
  ];

  const sections: ReportContent["sections"] = [
    { heading: `Today (${fmtDate(date)})`, columns: ["", "Amount"], rows: profitRows(day) },
    { heading: `Month to date (from ${fmtDate(monthStart)})`, columns: ["", "Amount"], rows: profitRows(mtd) },
  ];

  let cashBank = "-";
  if (place.divisionId === null && place.branchId === null) {
    const positions = await getAccountPositions(db, businessId, date);
    const accounts = [...positions.banks, ...positions.cash];
    const total = accounts.reduce((s, a) => s + a.balance, 0n);
    cashBank = inrShort(total);
    sections.push({
      heading: "Cash and bank now",
      columns: ["Account", "Balance"],
      rows: [...accounts.map((a) => [`${a.label}`, inr(a.balance)]), ["Total", inr(total)]],
    });
    const expenses = (await getExpenseBreakdown(db, businessId, date, date)).filter((e) => !e.setup && e.amount !== 0n);
    if (expenses.length) {
      sections.push({ heading: "Expenses today", columns: ["Expense", "Amount"], rows: expenses.map((e) => [e.name, inr(e.amount)]) });
    }
  } else {
    const positions = await getAccountPositions(db, businessId, date);
    const pendingOpening = [...positions.banks, ...positions.cash].reduce((s, a) => s + a.openingPending, 0n);
    const rows = await getCashByPlace(db, businessId, date, pendingOpening);
    const mine = rows.find((r) => r.label.includes(label.split(": ")[1] ?? "\u0000") && r.depth === (place.branchId !== null ? 2 : 1));
    if (mine) {
      cashBank = inrShort(mine.balance);
      sections.push({ heading: "Cash and bank held for this place", columns: ["", "Amount"], rows: [["Opening balance", inr(mine.opening)], ["Trading since opening", inr(mine.trading)], ["Balance", inr(mine.balance)]] });
    }
  }

  return {
    type: "DAILY_FULL",
    title: "Daily Report",
    subtitle: `${label} - ${fmtDate(date)}`,
    params: [fmtDate(date), label, inrShort(day.sales - day.discounts), inrShort(day.gross), inrShort(day.operating), cashBank].map((v) => cleanParam(v)),
    sections,
    footnote: await pendingNote(db, businessId),
  };
}

async function stockRows(db: Pool, businessId: number, place: Place, asOf: string) {
  const s = scope("l", place);
  const [rows] = await db.execute<Row[]>(
    `SELECT l.location_name, p.product_name, v.sku, v.size_label, v.color_name, v.unit_of_measure AS uom,
            SUM(m.quantity_change) AS qty
     FROM acct_stock_movements m
     JOIN acct_inventory_locations l ON l.id = m.location_id AND l.legal_business_id = m.legal_business_id
     JOIN acct_product_variants v ON v.id = m.variant_id AND v.legal_business_id = m.legal_business_id
     JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
     WHERE m.legal_business_id = ? AND m.movement_date <= ?${s.sql}
     GROUP BY m.location_id, l.location_name, m.variant_id, p.product_name, v.sku, v.size_label, v.color_name, v.unit_of_measure
     ORDER BY l.location_name, p.product_name, v.sku`,
    [businessId, asOf, ...s.values]
  );
  return rows.map((r) => ({
    location: String(r.location_name),
    product: String(r.product_name),
    sku: String(r.sku),
    detail: [r.size_label, r.color_name].filter(Boolean).join(" / "),
    uom: String(r.uom),
    qty: qty(r.qty),
  }));
}

async function lowStockLimit(db: Pool, businessId: number): Promise<number> {
  try {
    const [r] = await db.execute<Row[]>(`SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = 'low_stock_units'`, [businessId]);
    const n = Number(r[0]?.setting_value);
    return Number.isFinite(n) && n >= 0 ? n : 5;
  } catch {
    return 5;
  }
}

async function stockReport({ db, businessId, place, today, type }: BuildInput): Promise<ReportContent> {
  const monthly = type === "STOCK_MONTHLY";
  const period = reportPeriod(type, today);
  const asOf = monthly ? period.to : today;
  const label = await placeLabel(db, businessId, place);
  const rows = await stockRows(db, businessId, place, asOf);
  const limit = await lowStockLimit(db, businessId);

  const inStock = rows.filter((r) => r.qty > 0);
  const low = rows.filter((r) => r.qty <= limit);
  const totalUnits = inStock.reduce((s, r) => s + r.qty, 0);

  const sections: ReportContent["sections"] = [
    {
      heading: `Stock on hand at ${fmtDate(asOf)}`,
      columns: ["Location", "Item", "SKU", "Size / colour", "Qty"],
      rows: inStock.length ? inStock.map((r) => [r.location, r.product, r.sku, r.detail, `${fmtQty(r.qty)} ${r.uom}`]) : [["No stock on hand", "", "", "", ""]],
    },
  ];
  if (low.length) {
    sections.push({
      heading: `Low or out of stock (${limit} or fewer)`,
      columns: ["Location", "Item", "SKU", "Qty"],
      rows: low.map((r) => [r.location, r.product, r.sku, `${fmtQty(r.qty)} ${r.uom}`]),
    });
  }
  if (monthly) {
    const s = scope("l", place);
    const [moves] = await db.execute<Row[]>(
      `SELECT m.movement_type AS t, SUM(m.quantity_change) AS q
       FROM acct_stock_movements m JOIN acct_inventory_locations l ON l.id = m.location_id AND l.legal_business_id = m.legal_business_id
       WHERE m.legal_business_id = ? AND m.movement_date BETWEEN ? AND ?${s.sql}
       GROUP BY m.movement_type ORDER BY m.movement_type`,
      [businessId, period.from, period.to, ...s.values]
    );
    sections.push({
      heading: `Movement during ${fmtMonth(period.key)}`,
      columns: ["Type", "Units (+ in, - out)"],
      rows: moves.length ? moves.map((m) => [String(m.t).replaceAll("_", " "), fmtQty(qty(m.q))]) : [["No movement", "-"]],
    });
  }

  return {
    type,
    title: monthly ? "Monthly Stock Report" : "Daily Stock Report",
    subtitle: `${label} - as at ${fmtDate(asOf)}`,
    params: [monthly ? `monthly stock report (${fmtMonth(period.key)})` : `daily stock report ${fmtDate(asOf)}`, label, String(inStock.length), fmtQty(totalUnits), String(low.length)].map((v) => cleanParam(v)),
    sections,
  };
}

async function alerts({ db, businessId, place, today }: BuildInput): Promise<ReportContent> {
  const label = await placeLabel(db, businessId, place);
  const limit = await lowStockLimit(db, businessId);
  const low = (await stockRows(db, businessId, place, today)).filter((r) => r.qty <= limit);

  const s = scope("h", place);
  const [owing] = await db.execute<Row[]>(
    `SELECT h.customer_name AS name, MAX(h.customer_phone) AS phone,
            SUM(h.grand_total
                - COALESCE((SELECT SUM(p.amount) FROM acct_sales_payments p WHERE p.sale_id = h.id AND p.status = 'RECORDED'), 0)
                - COALESCE((SELECT SUM(r.refund_value) FROM acct_sales_returns r WHERE r.sale_id = h.id AND r.status = 'POSTED'), 0)
                + COALESCE((SELECT SUM(px.amount) FROM acct_sales_payments px JOIN acct_sales_returns r3 ON r3.id = px.exchange_return_id WHERE r3.sale_id = h.id AND px.status = 'RECORDED'), 0)
                + COALESCE((SELECT SUM(f.amount) FROM acct_sales_refunds f JOIN acct_sales_returns r2 ON r2.id = f.return_id WHERE r2.sale_id = h.id AND f.status = 'RECORDED'), 0)
            ) AS due,
            MIN(h.invoice_date) AS since
     FROM acct_sales_headers h
     WHERE h.legal_business_id = ? AND h.status = 'POSTED'${s.sql}
     GROUP BY h.customer_name
     HAVING due > 0.004
     ORDER BY due DESC`,
    [businessId, ...s.values]
  );
  const customerTotal = owing.reduce((sum, r) => sum + toPaise(r.due), 0n);

  const divisionForPurchases = place.divisionId;
  const [payable] = await db.execute<Row[]>(
    `SELECT sp.supplier_name AS name,
            SUM(pl.total - COALESCE(pp.paid, 0) - COALESCE(sr.credit, 0)) AS due
     FROM acct_purchase_headers ph
     JOIN acct_suppliers sp ON sp.id = ph.supplier_id AND sp.legal_business_id = ph.legal_business_id
     LEFT JOIN (SELECT r.purchase_id,
                       SUM(r.agreed_value - COALESCE((SELECT SUM(f.amount) FROM acct_supplier_refunds f
                                                      WHERE f.return_id = r.id AND f.status = 'RECORDED'), 0)) AS credit
                FROM acct_supplier_returns r WHERE r.status = 'POSTED' GROUP BY r.purchase_id) sr ON sr.purchase_id = ph.id
     JOIN (SELECT purchase_id, SUM(line_amount) AS total FROM acct_purchase_lines GROUP BY purchase_id) pl ON pl.purchase_id = ph.id
     LEFT JOIN (SELECT purchase_id, SUM(amount) AS paid FROM acct_purchase_payments WHERE status = 'VERIFIED' GROUP BY purchase_id) pp ON pp.purchase_id = ph.id
     WHERE ph.legal_business_id = ? AND ph.status = 'POSTED'${divisionForPurchases !== null ? " AND ph.division_id = ?" : ""}
     GROUP BY ph.supplier_id, sp.supplier_name
     HAVING due > 0.004
     ORDER BY due DESC`,
    divisionForPurchases !== null ? [businessId, divisionForPurchases] : [businessId]
  );
  const supplierTotal = payable.reduce((sum, r) => sum + toPaise(r.due), 0n);

  const sections: ReportContent["sections"] = [];
  if (low.length) sections.push({ heading: `Low or out of stock (${limit} or fewer)`, columns: ["Location", "Item", "SKU", "Qty"], rows: low.map((r) => [r.location, r.product, r.sku, `${fmtQty(r.qty)} ${r.uom}`]) });
  if (owing.length) sections.push({ heading: "Customers who owe money", columns: ["Customer", "Phone", "Since", "Amount due"], rows: owing.map((r) => [String(r.name ?? ""), String(r.phone ?? ""), String(r.since).slice(0, 10), inr(toPaise(r.due))]) });
  if (payable.length) sections.push({ heading: "Suppliers to pay", columns: ["Supplier", "Amount due"], rows: payable.map((r) => [String(r.name), inr(toPaise(r.due))]) });

  return {
    type: "ALERTS",
    title: "Stock and Dues Alerts",
    subtitle: `${label} - ${fmtDate(today)}`,
    params: [fmtDate(today), label, String(low.length), String(owing.length), inrShort(customerTotal), inrShort(supplierTotal)].map((v) => cleanParam(v)),
    sections,
    empty: sections.length === 0,
  };
}

async function investorStatement({ db, businessId, today, investor }: BuildInput): Promise<ReportContent> {
  const period = reportPeriod("INVESTOR_STATEMENT", today);
  if (!investor) throw new Error("This person is not linked to an investor, so there is no statement to build.");

  const { versions } = await loadShares(db, businessId);
  const mine = versions.filter((v) => v.partyId === investor.partyId);
  const segments = buildSegments(mine, period.from, period.to);
  const lookup = await profitLookupFor(db, businessId, segments.map((s) => ({ from: s.segFrom, to: s.segTo })));
  const { rows, totals } = allocate(segments, lookup);
  const total = totals.reduce((s, t) => s + t.payable, 0n);

  const [names] = await Promise.all([db.execute<Row[]>(`SELECT id, name FROM acct_divisions WHERE legal_business_id = ?`, [businessId])]);
  const divisionName = new Map(names[0].map((d) => [Number(d.id), String(d.name)]));
  const [branchRows] = await db.execute<Row[]>(`SELECT id, branch_name FROM acct_branches WHERE legal_business_id = ?`, [businessId]);
  const branchName = new Map(branchRows.map((b) => [Number(b.id), String(b.branch_name)]));
  const place = (p: { divisionId: number | null; branchId: number | null }) =>
    p.branchId !== null ? `Branch ${branchName.get(p.branchId) ?? p.branchId}` : p.divisionId !== null ? `Division ${divisionName.get(p.divisionId) ?? p.divisionId}` : "Whole group";
  const basisName = { GROSS: "Gross profit", OPERATING: "Operating profit", NET: "Net profit" } as const;

  return {
    type: "INVESTOR_STATEMENT",
    title: "Investor Profit Statement",
    subtitle: `${investor.name} - ${fmtMonth(period.key)}`,
    params: [investor.name, fmtMonth(period.key), inr(total), String(totals.length)].map((v) => cleanParam(v)),
    sections: [
      {
        heading: "Your share this month",
        columns: ["Agreement", "Profit of", "Basis", "Share", "Dates", "Profit then", "Your part"],
        rows: rows.length
          ? [
              ...rows.map((r) => [r.agreementNo, place(r.place), basisName[r.basis], formatUnits(r.units), `${r.from} to ${r.to}`, inr(r.profitBase), inr(r.share)]),
              ...totals.map((t) => [`${t.agreementNo} payable`, "", "", "", "", "", inr(t.payable)]),
            ]
          : [["No agreement applied this month", "", "", "", "", "", ""]],
      },
    ],
    footnote:
      "Figures come from the group's posted accounts. A loss in one part of the month reduces the next part of the same agreement; nothing is payable as a negative amount.",
    empty: totals.length === 0,
  };
}

