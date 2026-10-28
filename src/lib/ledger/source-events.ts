/**
 * Read-only: builds journal drafts from the operational tables.
 *
 * Runs SELECT statements only; it never inserts or updates. It is used
 * by the dry-run report so the owner can review every proposed entry
 * (and the resulting trial balance) before any real posting is enabled.
 *
 * Records the ledger would not understand are reported as `problems`
 * rather than skipped silently.
 */

import type {
  Connection,
  Pool,
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

import {
  ACCOUNT,
  salesRefundEntry,
  setupCapitalisationEntry,
  salesReturnEntry,
  stockDamageEntry,
  supplierReturnEntry,
  supplierRefundEntry,
  freeStockEntry,
  depositPaidEntry,
  depositRefundEntry,
  expenseEntry,
  expensePaymentEntry,
  openingBalanceEntry,
  partySetoffEntry,
  fixedAssetPurchaseEntry,
  ownerMoneyEntry,
  cashTakenEntry,
  fundingReceiptEntry,
  assetDepreciationEntry,
  assetDisposalEntry,
  staffAdvanceEntry,
  purchasePaymentEntry,
  purchaseReceiptEntry,
  saleInvoiceEntry,
  salesReceiptEntry,
  salesSettlementDiscountEntry,
  type Dimensions,
  type JournalDraft,
  type Settlement,
  type SourceType,
} from "./posting-rules.ts";

export type Queryable = Pool | PoolConnection | Connection;

export type ChartAccount = {
  id: number;
  code: string;
  name: string;
  type: string;
  subtype: string;
  isPosting: boolean;
  active: boolean;
  requiresDivision: boolean;
  requiresBranch: boolean;
};

export type LedgerBuild = {
  drafts: JournalDraft[];
  chart: Map<string, ChartAccount>;
  /** Things a person should look at; entries are still produced. */
  warnings: string[];
  /** Entries or lines that could not be built or would be rejected on posting. */
  problems: string[];
};

type Row = RowDataPacket & Record<string, unknown>;

const SOURCE_ORDER: SourceType[] = [
  "OPENING_BALANCE",
  "DEPOSIT_PAID",
  "DEPOSIT_REFUND",
  "EXPENSE",
  "SETUP_CAPITALISATION",
  "EXPENSE_PAYMENT",
  "PURCHASE_RECEIPT",
  "PURCHASE_PAYMENT",
  "SALES_INVOICE",
  "SALES_RECEIPT",
  "SALES_RETURN",
  "SALES_REFUND",
  "STOCK_DAMAGE",
  "SUPPLIER_RETURN",
  "SUPPLIER_REFUND",
  "FREE_STOCK",
  "PARTY_SETOFF",
  "FIXED_ASSET",
  "ASSET_DEPRECIATION",
  "ASSET_DISPOSAL",
  "STAFF_ADVANCE",
  "OWNER_MONEY",
  "CASH_TAKEN",
  "FUNDING_RECEIPT",
];

const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

async function select(conn: Queryable, sql: string, values: unknown[] = []) {
  const [rows] = await (conn as Pool).query<Row[]>(sql, values);
  return rows;
}

export async function loadChart(
  conn: Queryable,
  businessId: number
): Promise<Map<string, ChartAccount>> {
  const rows = await select(
    conn,
    `SELECT id, account_code, account_name, account_type, account_subtype,
            is_posting_account, status, requires_division, requires_branch
     FROM acct_chart_of_accounts
     WHERE legal_business_id = ?`,
    [businessId]
  );

  return new Map(
    rows.map((r) => [
      str(r.account_code),
      {
        id: Number(r.id),
        code: str(r.account_code),
        name: str(r.account_name),
        type: str(r.account_type),
        subtype: str(r.account_subtype),
        isPosting: Number(r.is_posting_account) === 1,
        active: str(r.status) === "ACTIVE",
        requiresDivision: Number(r.requires_division) === 1,
        requiresBranch: Number(r.requires_branch) === 1,
      },
    ])
  );
}

export async function buildLedgerDrafts(
  conn: Queryable,
  businessId: number,
  options: { openingDate?: string } = {}
): Promise<LedgerBuild> {
  const chart = await loadChart(conn, businessId);
  const warnings: string[] = [];
  const problems: string[] = [];
  const drafts: JournalDraft[] = [];

  const codeById = new Map<number, string>();
  for (const a of chart.values()) codeById.set(a.id, a.code);

  const banks = new Map<number, Row>();
  for (const b of await select(
    conn,
    `SELECT id, ownership_type, gl_account_id, account_label
     FROM acct_bank_accounts WHERE legal_business_id = ?`,
    [businessId]
  )) {
    banks.set(Number(b.id), b);
  }

  const cashAccounts = new Map<number, Row>();
  for (const c of await select(
    conn,
    `SELECT id, cash_name, gl_account_id, division_id, branch_id
     FROM acct_cash_accounts WHERE legal_business_id = ?`,
    [businessId]
  )) {
    cashAccounts.set(Number(c.id), c);
  }

  const dims = (division: unknown, branch: unknown): Dimensions => ({
    divisionId: num(division),
    branchId: num(branch),
  });

  /** Resolve where money moved, from a payment row's bank/cash ids and source. */
  function settle(
    label: string,
    source: string | null,
    bankId: unknown,
    cashId: unknown
  ): Settlement | null {
    if (source === "OWNER_PERSONAL") return { kind: "OWNER" };
    if (source === "INVESTOR_BANK" || source === "INVESTOR_CASH") {
      return { kind: "INVESTOR" };
    }

    const bank = bankId === null || bankId === undefined ? null : banks.get(Number(bankId));
    const cash = cashId === null || cashId === undefined ? null : cashAccounts.get(Number(cashId));

    // Sales receipts carry no payment_source: infer from the account used.
    if (source === null && bank && str(bank.ownership_type) === "INVESTOR") {
      return { kind: "INVESTOR" };
    }

    const account = bank ?? cash;
    if (!account) {
      problems.push(`${label}: no bank or cash account recorded`);
      return null;
    }

    const glId = num(account.gl_account_id);
    const code = glId === null ? undefined : codeById.get(glId);
    if (!code) {
      problems.push(
        `${label}: ${bank ? "bank" : "cash"} account "${str(
          bank ? bank.account_label : (cash as Row).cash_name
        )}" has no ledger account mapped`
      );
      return null;
    }

    return { kind: "ACCOUNT", accountCode: code };
  }

  function add(label: string, build: () => JournalDraft | null) {
    try {
      const draft = build();
      if (draft) drafts.push(draft);
    } catch (error) {
      problems.push(`${label}: ${(error as Error).message}`);
    }
  }

  // ------------------------------------------------------ opening balance
  const batches = await select(
    conn,
    `SELECT id, DATE_FORMAT(opening_date, '%Y-%m-%d') AS opening_date,
            status, description
     FROM acct_opening_balance_batches
     WHERE legal_business_id = ?
       AND status NOT IN ('CANCELLED', 'REJECTED', 'VOID')
     ORDER BY id`,
    [businessId]
  );

  for (const batch of batches) {
    const lines = await select(
      conn,
      `SELECT account_id, division_id, branch_id, debit, credit, notes
       FROM acct_opening_balance_lines
       WHERE legal_business_id = ? AND batch_id = ?
       ORDER BY line_no`,
      [businessId, batch.id]
    );

    add(`Opening balance batch ${batch.id}`, () =>
      openingBalanceEntry({
        id: Number(batch.id),
        date: options.openingDate ?? str(batch.opening_date),
        description: str(batch.description) || "Opening balances",
        lines: lines.map((l) => {
          const code = codeById.get(Number(l.account_id));
          if (!code) throw new Error(`unknown account id ${str(l.account_id)}`);
          return {
            accountCode: code,
            debit: str(l.debit),
            credit: str(l.credit),
            dims: dims(l.division_id, l.branch_id),
            memo: str(l.notes) || "Opening balance",
          };
        }),
      })
    );

    if (str(batch.status) !== "POSTED") {
      warnings.push(
        `Opening balance batch ${str(batch.id)} is ${str(batch.status)}, not posted: ` +
          `it is included here so the books can be reviewed as a whole.`
      );
    }
  }

  // --------------------------------------------------------------- sales
  const sales = await select(
    conn,
    `SELECT s.id, s.invoice_no, DATE_FORMAT(s.invoice_date, '%Y-%m-%d') AS d,
            s.division_id, s.branch_id, s.subtotal, s.discount_amount,
            s.grand_total,
            COALESCE(SUM(l.total_cost), 0) AS cogs,
            COUNT(l.id) AS line_count,
            COUNT(l.total_cost) AS costed_lines
     FROM acct_sales_headers s
     LEFT JOIN acct_sales_lines l
       ON l.legal_business_id = s.legal_business_id
      AND l.sale_id = s.id
     WHERE s.legal_business_id = ? AND s.status = 'POSTED'
     GROUP BY s.id, s.invoice_no, s.invoice_date, s.division_id,
              s.branch_id, s.subtotal, s.discount_amount, s.grand_total
     ORDER BY s.invoice_date, s.id`,
    [businessId]
  );

  const saleById = new Map<number, Row>();
  for (const s of sales) {
    saleById.set(Number(s.id), s);
    add(`Invoice ${str(s.invoice_no)}`, () => {
      if (Number(s.costed_lines) !== Number(s.line_count)) {
        throw new Error("some lines have no recorded cost");
      }
      return saleInvoiceEntry({
        id: Number(s.id),
        invoiceNo: str(s.invoice_no),
        date: str(s.d),
        dims: dims(s.division_id, s.branch_id),
        subtotal: str(s.subtotal),
        discount: str(s.discount_amount),
        grandTotal: str(s.grand_total),
        costOfGoodsSold: str(s.cogs),
      });
    });
  }

  const receipts = await select(
    conn,
    `SELECT p.id, p.sale_id, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d,
            p.amount, p.payment_method, p.bank_account_id, p.cash_account_id
     FROM acct_sales_payments p
     JOIN acct_sales_headers s
       ON s.legal_business_id = p.legal_business_id AND s.id = p.sale_id
     WHERE p.legal_business_id = ? AND p.status = 'RECORDED'
       AND s.status = 'POSTED'
     ORDER BY p.payment_date, p.id`,
    [businessId]
  );

  for (const p of receipts) {
    const sale = saleById.get(Number(p.sale_id));
    const label = `Receipt ${str(p.id)} for invoice ${sale ? str(sale.invoice_no) : str(p.sale_id)}`;
    add(label, () => {
      if (!sale) throw new Error("its invoice is not posted");
      if (str(p.payment_method) === "SET_OFF") return null; // posted once, as the set-off itself
      if (str(p.payment_method) === "DISCOUNT") {
        return salesSettlementDiscountEntry({
          id: Number(p.id),
          invoiceNo: str(sale.invoice_no),
          date: str(p.d),
          amount: str(p.amount),
          dims: dims(sale.division_id, sale.branch_id),
        });
      }
      const settlement = settle(label, null, p.bank_account_id, p.cash_account_id);
      if (!settlement) return null;
      return salesReceiptEntry({
        id: Number(p.id),
        invoiceNo: str(sale.invoice_no),
        date: str(p.d),
        amount: str(p.amount),
        dims: dims(sale.division_id, sale.branch_id),
        settlement,
      });
    });
  }

  // ------------------------------------------- returns, refunds, damages
  const returns = await select(
    conn,
    `SELECT r.id, r.return_no, DATE_FORMAT(r.return_date, '%Y-%m-%d') AS d,
            r.division_id, r.branch_id, r.gross_value, r.refund_value,
            s.invoice_no,
            COALESCE(SUM(CASE WHEN l.item_condition = 'RESELLABLE' THEN l.total_cost END), 0) AS restock_cost,
            COALESCE(SUM(CASE WHEN l.item_condition = 'DAMAGED' THEN l.total_cost END), 0) AS damaged_cost
     FROM acct_sales_returns r
     JOIN acct_sales_headers s
       ON s.legal_business_id = r.legal_business_id AND s.id = r.sale_id
     LEFT JOIN acct_sales_return_lines l
       ON l.legal_business_id = r.legal_business_id AND l.return_id = r.id
     WHERE r.legal_business_id = ? AND r.status = 'POSTED'
     GROUP BY r.id, r.return_no, r.return_date, r.division_id, r.branch_id,
              r.gross_value, r.refund_value, s.invoice_no
     ORDER BY r.return_date, r.id`,
    [businessId]
  );

  const returnById = new Map<number, Row>();
  for (const r of returns) {
    returnById.set(Number(r.id), r);
    add(`Return ${str(r.return_no)}`, () =>
      salesReturnEntry({
        id: Number(r.id),
        returnNo: str(r.return_no),
        invoiceNo: str(r.invoice_no),
        date: str(r.d),
        dims: dims(r.division_id, r.branch_id),
        grossValue: str(r.gross_value),
        refundValue: str(r.refund_value),
        restockCost: str(r.restock_cost),
        damagedCost: str(r.damaged_cost),
      })
    );
  }

  const refunds = await select(
    conn,
    `SELECT f.id, f.return_id, DATE_FORMAT(f.refund_date, '%Y-%m-%d') AS d,
            f.amount, f.bank_account_id, f.cash_account_id
     FROM acct_sales_refunds f
     JOIN acct_sales_returns r
       ON r.legal_business_id = f.legal_business_id AND r.id = f.return_id
     WHERE f.legal_business_id = ? AND f.status = 'RECORDED' AND r.status = 'POSTED'
     ORDER BY f.refund_date, f.id`,
    [businessId]
  );

  for (const f of refunds) {
    const ret = returnById.get(Number(f.return_id));
    const label = `Refund ${str(f.id)} for return ${ret ? str(ret.return_no) : str(f.return_id)}`;
    add(label, () => {
      if (!ret) throw new Error("its return is not posted");
      const settlement = settle(label, null, f.bank_account_id, f.cash_account_id);
      if (!settlement) return null;
      return salesRefundEntry({
        id: Number(f.id),
        returnNo: str(ret.return_no),
        date: str(f.d),
        amount: str(f.amount),
        dims: dims(ret.division_id, ret.branch_id),
        settlement,
      });
    });
  }

  const damages = await select(
    conn,
    `SELECT id, division_id, branch_id, reason, total_cost,
            DATE_FORMAT(damage_date, '%Y-%m-%d') AS d
     FROM acct_stock_damages
     WHERE legal_business_id = ? AND status = 'POSTED'
     ORDER BY damage_date, id`,
    [businessId]
  );

  for (const m of damages) {
    add(`Stock damage ${str(m.id)}`, () =>
      stockDamageEntry({
        id: Number(m.id),
        date: str(m.d),
        reason: str(m.reason),
        cost: str(m.total_cost),
        dims: dims(m.division_id, m.branch_id),
      })
    );
  }

  // ----------------------------------------------------------- purchases
  const purchases = await select(
    conn,
    `SELECT h.id, h.purchase_no, h.division_id,
            DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%Y-%m-%d') AS d,
            COALESCE(SUM(l.line_amount), 0) AS total
     FROM acct_purchase_headers h
     LEFT JOIN acct_purchase_lines l
       ON l.legal_business_id = h.legal_business_id AND l.purchase_id = h.id
     WHERE h.legal_business_id = ? AND h.status = 'POSTED'
     GROUP BY h.id, h.purchase_no, h.division_id, h.received_date, h.invoice_date
     ORDER BY COALESCE(h.received_date, h.invoice_date), h.id`,
    [businessId]
  );

  const purchaseById = new Map<number, Row>();
  for (const h of purchases) {
    purchaseById.set(Number(h.id), h);
    add(`Purchase ${str(h.purchase_no)}`, () =>
      purchaseReceiptEntry({
        id: Number(h.id),
        purchaseNo: str(h.purchase_no),
        date: str(h.d),
        dims: dims(h.division_id, null),
        total: str(h.total),
      })
    );
  }

  const purchasePayments = await select(
    conn,
    `SELECT p.id, p.payment_no, p.purchase_id, p.division_id,
            DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, p.amount,
            p.payment_method, p.payment_source,
            p.source_bank_account_id, p.source_cash_account_id
     FROM acct_purchase_payments p
     JOIN acct_purchase_headers h
       ON h.legal_business_id = p.legal_business_id AND h.id = p.purchase_id
     WHERE p.legal_business_id = ? AND p.status = 'VERIFIED'
       AND h.status = 'POSTED'
     ORDER BY p.payment_date, p.id`,
    [businessId]
  );

  for (const p of purchasePayments) {
    const label = `Supplier payment ${str(p.payment_no)}`;
    if (str(p.payment_method) === "CASH" && p.source_bank_account_id !== null) {
      warnings.push(
        `${label}: method is CASH but it was paid from a bank account. ` +
          `Posts the same, but the record should be corrected.`
      );
    }
    add(label, () => {
      if (str(p.payment_method) === "SET_OFF") return null; // posted once, as the set-off itself
      const settlement = settle(
        label,
        str(p.payment_source),
        p.source_bank_account_id,
        p.source_cash_account_id
      );
      if (!settlement) return null;
      return purchasePaymentEntry({
        id: Number(p.id),
        paymentNo: str(p.payment_no),
        date: str(p.d),
        amount: str(p.amount),
        dims: dims(p.division_id, null),
        settlement,
      });
    });
  }

  // ------------------------------------------- supplier / customer set-offs
  const setoffs = await select(
    conn,
    `SELECT o.id, o.setoff_no, DATE_FORMAT(o.setoff_date, '%Y-%m-%d') AS d,
            s.supplier_name, c.full_name AS customer_name
     FROM acct_party_setoffs o
     JOIN acct_suppliers s ON s.id = o.supplier_id
     JOIN acct_customers c ON c.id = o.customer_id
     WHERE o.legal_business_id = ? AND o.status = 'RECORDED'
     ORDER BY o.id`,
    [businessId]
  );
  for (const o of setoffs) {
    const saleParts = await select(
      conn,
      `SELECT h.division_id, h.branch_id, SUM(l.amount) AS amount
       FROM acct_party_setoff_lines l
       JOIN acct_sales_headers h ON h.id = l.doc_id
       WHERE l.setoff_id = ? AND l.side = 'SALE'
       GROUP BY h.division_id, h.branch_id`,
      [Number(o.id)]
    );
    const purchaseParts = await select(
      conn,
      `SELECT h.division_id, SUM(l.amount) AS amount
       FROM acct_party_setoff_lines l
       JOIN acct_purchase_headers h ON h.id = l.doc_id
       WHERE l.setoff_id = ? AND l.side = 'PURCHASE'
       GROUP BY h.division_id`,
      [Number(o.id)]
    );
    add(`Set-off ${str(o.setoff_no)}`, () =>
      partySetoffEntry({
        id: Number(o.id),
        setoffNo: str(o.setoff_no),
        date: str(o.d),
        partyName: str(o.supplier_name) === str(o.customer_name) ? str(o.supplier_name) : `${str(o.supplier_name)} / ${str(o.customer_name)}`,
        payableParts: purchaseParts.map((r) => ({ amount: str(r.amount), dims: dims(r.division_id, null) })),
        receivableParts: saleParts.map((r) => ({ amount: str(r.amount), dims: dims(r.division_id, r.branch_id) })),
      })
    );
  }

  // ------------------------------------------------------- staff advances
  const advances = await select(
    conn,
    `SELECT a.id, a.advance_no, a.amount, a.paid_from, a.bank_account_id, a.cash_account_id,
            DATE_FORMAT(a.given_on, '%Y-%m-%d') AS d, e.full_name, e.division_id, e.branch_id
     FROM acct_staff_advances a JOIN acct_employees e ON e.id = a.employee_id
     WHERE a.legal_business_id = ? ORDER BY a.given_on, a.id`,
    [businessId]
  );
  for (const a of advances) {
    const label = `Staff advance ${str(a.advance_no)}`;
    add(label, () => {
      const settlement = settle(label, str(a.paid_from) === "BANK" ? "BUSINESS_BANK" : "BUSINESS_CASH", a.bank_account_id, a.cash_account_id);
      if (!settlement) return null;
      return staffAdvanceEntry({
        id: Number(a.id), advanceNo: str(a.advance_no), employeeName: str(a.full_name), date: str(a.d), amount: str(a.amount),
        dims: dims(a.division_id, a.branch_id), settlement,
      });
    });
  }

  // --------------------------------------------------- owner money in / out
  const ownerMoney = await select(
    conn,
    `SELECT id, entry_no, direction, account_kind, bank_account_id, cash_account_id, note,
            DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, amount
     FROM acct_owner_money WHERE legal_business_id = ? ORDER BY entry_date, id`,
    [businessId]
  ).catch(() => [] as Row[]); // before migration 037 is run
  for (const o of ownerMoney) {
    const label = `Owner money ${str(o.entry_no)}`;
    add(label, () => {
      const settlement = settle(label, str(o.account_kind) === "BANK" ? "BUSINESS_BANK" : "BUSINESS_CASH", o.bank_account_id, o.cash_account_id);
      if (!settlement) return null;
      return ownerMoneyEntry({
        id: Number(o.id), entryNo: str(o.entry_no), direction: str(o.direction) === "OUT" ? "OUT" : "IN", date: str(o.d),
        amount: str(o.amount), note: str(o.note), dims: dims(null, null), settlement,
      });
    });
  }

  // ------------------------------------ investor money received / paid back
  const funding = await select(
    conn,
    `SELECT t.id, t.transaction_no, t.transaction_type, t.bank_account_id, t.cash_account_id, t.amount,
            DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS d, a.agreement_no, a.division_id, a.branch_id
     FROM acct_funding_transactions t
     JOIN acct_funding_agreements a ON a.legal_business_id = t.legal_business_id AND a.id = t.agreement_id
     WHERE t.legal_business_id = ? AND t.status = 'VERIFIED' ORDER BY t.transaction_date, t.id`,
    [businessId]
  );
  for (const f of funding) {
    const label = `Funding ${str(f.transaction_no)}`;
    add(label, () => {
      const type = str(f.transaction_type);
      if (type === "RETURN_PAID") throw new Error("returns paid to investors have no ledger rule yet");
      const settlement = settle(label, str(f.bank_account_id) ? "BUSINESS_BANK" : "BUSINESS_CASH", f.bank_account_id, f.cash_account_id);
      if (!settlement) return null;
      return fundingReceiptEntry({
        id: Number(f.id), txNo: str(f.transaction_no), kind: type === "PRINCIPAL_REPAID" ? "REPAID" : "RECEIVED", date: str(f.d),
        amount: str(f.amount), agreementNo: str(f.agreement_no), dims: dims(f.division_id, f.branch_id), settlement,
      });
    });
  }

  // ------------------------------------------- cash taken away at closing
  const takenRows = await select(
    conn,
    `SELECT id, cash_account_id, taken_to, taken_bank_id, taken_out, DATE_FORMAT(closing_date, '%Y-%m-%d') AS d
     FROM acct_cash_closings WHERE legal_business_id = ? AND taken_out > 0 AND taken_to IS NOT NULL ORDER BY closing_date, id`,
    [businessId]
  ).catch(() => [] as Row[]); // before migration 039 is run
  for (const t of takenRows) {
    const label = `Cash taken ${str(t.d)}`;
    add(label, () => {
      const cash = settle(label, "BUSINESS_CASH", null, t.cash_account_id);
      if (!cash) return null;
      const to = str(t.taken_to) === "BANK" ? "BANK" : "OWNER";
      const target = to === "BANK" ? settle(label, "BUSINESS_BANK", t.taken_bank_id, null) : null;
      if (to === "BANK" && !target) return null;
      const drawer = cashAccounts.get(Number(t.cash_account_id));
      return cashTakenEntry({
        id: Number(t.id), date: str(t.d), amount: str(t.taken_out), to, dims: dims(drawer?.division_id, drawer?.branch_id), cash, target,
      });
    });
  }

  // ----------------------------------------- fixed assets and depreciation
  const assets = await select(
    conn,
    `SELECT id, asset_no, asset_name, division_id, paid_from, bank_account_id, cash_account_id, status,
            DATE_FORMAT(purchase_date, '%Y-%m-%d') AS d, cost,
            DATE_FORMAT(disposed_on, '%Y-%m-%d') AS disposed_d, proceeds,
            proceeds_bank_account_id, proceeds_cash_account_id,
            COALESCE((SELECT SUM(x.amount) FROM acct_asset_depreciation x WHERE x.asset_id = acct_fixed_assets.id), 0) AS accumulated
     FROM acct_fixed_assets WHERE legal_business_id = ? ORDER BY id`,
    [businessId]
  );
  for (const a of assets) {
    const label = `Asset ${str(a.asset_no)}`;
    if (str(a.paid_from) !== "EARLIER") {
      add(label, () => {
        const settlement = settle(label, str(a.paid_from) === "BANK" ? "BUSINESS_BANK" : "BUSINESS_CASH", a.bank_account_id, a.cash_account_id);
        if (!settlement) return null;
        return fixedAssetPurchaseEntry({
          id: Number(a.id), assetNo: str(a.asset_no), name: str(a.asset_name), date: str(a.d), cost: str(a.cost),
          dims: dims(a.division_id, null), settlement,
        });
      });
    }
    if (str(a.status) === "DISPOSED") {
      add(`${label} disposal`, () => {
        const hasProceeds = Number(a.proceeds) > 0;
        const settlement = hasProceeds
          ? settle(`${label} disposal`, a.proceeds_bank_account_id ? "BUSINESS_BANK" : "BUSINESS_CASH", a.proceeds_bank_account_id, a.proceeds_cash_account_id)
          : null;
        if (hasProceeds && !settlement) return null;
        return assetDisposalEntry({
          id: Number(a.id), assetNo: str(a.asset_no), name: str(a.asset_name), date: str(a.disposed_d), cost: str(a.cost),
          accumulated: str(a.accumulated), proceeds: str(a.proceeds), dims: dims(a.division_id, null), proceedsSettlement: settlement,
        });
      });
    }
  }
  const depRuns = await select(
    conn,
    `SELECT id, division_id, period, total, DATE_FORMAT(LAST_DAY(CONCAT(period, '-01')), '%Y-%m-%d') AS d
     FROM acct_asset_dep_runs WHERE legal_business_id = ? AND total > 0 ORDER BY period, id`,
    [businessId]
  );
  for (const r of depRuns) {
    add(`Depreciation ${str(r.period)}`, () =>
      assetDepreciationEntry({ id: Number(r.id), period: str(r.period), date: str(r.d), total: str(r.total), dims: dims(r.division_id, null) })
    );
  }

  // ------------------------------------------------------------ expenses
  const expenses = await select(
    conn,
    `SELECT id, expense_no, division_id, branch_id, category, is_setup_cost, description,
            DATE_FORMAT(expense_date, '%Y-%m-%d') AS d, amount
     FROM acct_expenses
     WHERE legal_business_id = ? AND status = 'CONFIRMED'
     ORDER BY expense_date, id`,
    [businessId]
  );

  const expenseById = new Map<number, Row>();
  for (const e of expenses) {
    expenseById.set(Number(e.id), e);
    add(`Expense ${str(e.expense_no)}`, () =>
      expenseEntry({
        id: Number(e.id),
        expenseNo: str(e.expense_no),
        date: str(e.d),
        category: str(e.category),
        description: str(e.description),
        amount: str(e.amount),
        dims: dims(e.division_id, e.branch_id),
        isSetupCost: Number(e.is_setup_cost) === 1,
      })
    );
    if (Number(e.is_setup_cost) === 1) {
      add(`Set-up cost ${str(e.expense_no)}`, () =>
        setupCapitalisationEntry({
          id: Number(e.id),
          expenseNo: str(e.expense_no),
          date: str(e.d),
          amount: str(e.amount),
          dims: dims(e.division_id, e.branch_id),
        })
      );
    }
  }

  const expensePayments = await select(
    conn,
    `SELECT p.id, p.expense_id, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d,
            p.amount, p.payment_method, p.payment_source, p.bank_account_id, p.cash_account_id
     FROM acct_expense_payments p
     JOIN acct_expenses e
       ON e.legal_business_id = p.legal_business_id AND e.id = p.expense_id
     WHERE p.legal_business_id = ? AND p.status = 'RECORDED'
       AND e.status = 'CONFIRMED'
     ORDER BY p.payment_date, p.id`,
    [businessId]
  );

  for (const p of expensePayments) {
    const expense = expenseById.get(Number(p.expense_id));
    const label = `Expense payment ${str(p.id)}`;
    add(label, () => {
      if (!expense) throw new Error("its expense is not confirmed");
      // Part of a salary settled by taking back an advance: no cash or bank moves.
      const settlement: Settlement | null = str(p.payment_method) === "ADVANCE"
        ? { kind: "ACCOUNT", accountCode: ACCOUNT.STAFF_ADVANCES }
        : settle(
        label,
        str(p.payment_source),
        p.bank_account_id,
        p.cash_account_id
      );
      if (!settlement) return null;
      return expensePaymentEntry({
        id: Number(p.id),
        expenseNo: str(expense.expense_no),
        date: str(p.d),
        amount: str(p.amount),
        dims: dims(expense.division_id, expense.branch_id),
        settlement,
      });
    });
  }

  // --------------------------------------------------- refundable deposits
  const deposits = await select(
    conn,
    `SELECT t.id, t.transaction_type, DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS d,
            t.amount, t.payment_source, t.bank_account_id, t.cash_account_id,
            a.advance_no, a.division_id, a.branch_id
     FROM acct_advance_transactions t
     JOIN acct_advances a
       ON a.legal_business_id = t.legal_business_id AND a.id = t.advance_id
     WHERE t.legal_business_id = ? AND t.status = 'CONFIRMED'
     ORDER BY t.transaction_date, t.id`,
    [businessId]
  );

  for (const t of deposits) {
    const type = str(t.transaction_type);
    const label = `Advance ${str(t.advance_no)} ${type}`;

    if (type !== "ADVANCE_PAID" && type !== "REFUND_RECEIVED") {
      problems.push(`${label}: no ledger rule defined yet for ${type}`);
      continue;
    }

    add(label, () => {
      const settlement = settle(
        label,
        t.payment_source === null ? null : str(t.payment_source),
        t.bank_account_id,
        t.cash_account_id
      );
      if (!settlement) return null;
      const input = {
        id: Number(t.id),
        advanceNo: str(t.advance_no),
        date: str(t.d),
        amount: str(t.amount),
        dims: dims(t.division_id, t.branch_id),
        settlement,
      };
      return type === "ADVANCE_PAID"
        ? depositPaidEntry(input)
        : depositRefundEntry(input);
    });
  }

  // ----------------------------- supplier returns, refunds, free stock
  const supplierReturns = await select(
    conn,
    `SELECT id, return_no, division_id, cost_value, agreed_value,
            DATE_FORMAT(return_date, '%Y-%m-%d') AS d
     FROM acct_supplier_returns
     WHERE legal_business_id = ? AND status = 'POSTED'
     ORDER BY return_date, id`,
    [businessId]
  );

  const supplierReturnById = new Map<number, Row>();
  for (const r of supplierReturns) {
    supplierReturnById.set(Number(r.id), r);
    add(`Supplier return ${str(r.return_no)}`, () =>
      supplierReturnEntry({
        id: Number(r.id),
        returnNo: str(r.return_no),
        date: str(r.d),
        dims: dims(r.division_id, null),
        costValue: str(r.cost_value),
        agreedValue: str(r.agreed_value),
      })
    );
  }

  const supplierRefunds = await select(
    conn,
    `SELECT f.id, f.division_id, f.amount, f.bank_account_id, f.cash_account_id,
            ca.branch_id AS cash_branch_id,
            DATE_FORMAT(f.refund_date, '%Y-%m-%d') AS d
     FROM acct_supplier_refunds f
     LEFT JOIN acct_cash_accounts ca
       ON ca.id = f.cash_account_id AND ca.legal_business_id = f.legal_business_id
     WHERE f.legal_business_id = ? AND f.status = 'RECORDED'
     ORDER BY f.refund_date, f.id`,
    [businessId]
  );

  for (const f of supplierRefunds) {
    const label = `Supplier refund ${str(f.id)}`;
    add(label, () => {
      const settlement = settle(label, null, f.bank_account_id, f.cash_account_id);
      if (!settlement) return null;
      return supplierRefundEntry({
        id: Number(f.id),
        date: str(f.d),
        amount: str(f.amount),
        // A cash account belongs to one branch, so cash coming in is booked to that branch.
        dims: dims(f.division_id, f.cash_branch_id),
        settlement,
      });
    });
  }

  const freeStock = await select(
    conn,
    `SELECT id, entry_no, division_id, branch_id, given_to, total_cost,
            DATE_FORMAT(given_date, '%Y-%m-%d') AS d
     FROM acct_free_stock
     WHERE legal_business_id = ? AND status = 'APPROVED'
     ORDER BY given_date, id`,
    [businessId]
  );

  for (const g of freeStock) {
    add(`Free stock ${str(g.entry_no)}`, () =>
      freeStockEntry({
        id: Number(g.id),
        entryNo: str(g.entry_no),
        date: str(g.d),
        cost: str(g.total_cost),
        givenTo: str(g.given_to),
        dims: dims(g.division_id, g.branch_id),
      })
    );
  }

  // --------------------------------------------- chart-of-accounts checks
  for (const draft of drafts) {
    for (const line of draft.lines) {
      const account = chart.get(line.accountCode);
      const where = `${draft.sourceType} ${draft.sourceId} (${draft.description})`;

      if (!account) {
        problems.push(`${where}: account ${line.accountCode} does not exist`);
        continue;
      }
      if (!account.active || !account.isPosting) {
        problems.push(`${where}: account ${line.accountCode} cannot be posted to`);
      }
      if (account.requiresDivision && line.divisionId === null) {
        problems.push(`${where}: ${line.accountCode} requires a division`);
      }
      if (account.requiresBranch && line.branchId === null) {
        problems.push(`${where}: ${line.accountCode} requires a branch`);
      }
      if (line.branchId !== null && line.divisionId === null) {
        problems.push(`${where}: a branch needs a division`);
      }
    }
  }

  drafts.sort(
    (a, b) =>
      a.entryDate.localeCompare(b.entryDate) ||
      SOURCE_ORDER.indexOf(a.sourceType) - SOURCE_ORDER.indexOf(b.sourceType) ||
      a.sourceId - b.sourceId
  );

  return { drafts, chart, warnings, problems };
}
