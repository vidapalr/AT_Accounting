/**
 * Does the value of stock in the stock records agree with the Inventory account (1200) in the books?
 * Compared record by record (a purchase, a sale, a damage ...), so a difference points at the exact record.
 * Money is in paise (bigint). Transfers between places are left out on both sides: they only move stock.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

type Row = RowDataPacket & Record<string, unknown>;

export type StockMove = { sourceType: string; sourceId: number; divisionId: number; paise: bigint };
export type BookLine = { sourceType: string; sourceId: number; divisionId: number | null; paise: bigint };

export type StockDifference = {
  /** The record as the books name it, e.g. SALES_INVOICE */
  kind: string;
  id: number;
  stockPaise: bigint;
  booksPaise: bigint;
  /** NOT_POSTED: stock moved but nothing is in the books yet. AMOUNT_DIFFERS: both exist but not the same.
   *  BOOKS_ONLY: the books carry stock value with no stock record (for example opening stock). */
  reason: "NOT_POSTED" | "AMOUNT_DIFFERS" | "BOOKS_ONLY";
};

export type StockTieOut = {
  stockPaise: bigint;
  booksPaise: bigint;
  differencePaise: bigint;
  byDivision: Array<{ divisionId: number; stockPaise: bigint; booksPaise: bigint }>;
  differences: StockDifference[];
};

/** Stock records name some sources differently from the books. This maps them to the books' name. */
export function booksKind(sourceType: string): string {
  switch (sourceType) {
    case "PURCHASE": return "PURCHASE_RECEIPT";
    case "SALES_INVOICE_EDIT": return "SALES_INVOICE";
    case "STOCK_DAMAGE_CANCEL": return "STOCK_DAMAGE";
    default: return sourceType;
  }
}

export function compareStockToBooks(moves: StockMove[], books: BookLine[]): StockTieOut {
  const stock = new Map<string, bigint>();
  const booked = new Map<string, bigint>();
  const divisions = new Map<number, { stockPaise: bigint; booksPaise: bigint }>();
  const div = (id: number) => {
    const d = divisions.get(id) ?? { stockPaise: 0n, booksPaise: 0n };
    divisions.set(id, d);
    return d;
  };
  let stockPaise = 0n;
  let booksPaise = 0n;

  for (const m of moves) {
    const key = `${booksKind(m.sourceType)}#${m.sourceId}`;
    stock.set(key, (stock.get(key) ?? 0n) + m.paise);
    div(m.divisionId).stockPaise += m.paise;
    stockPaise += m.paise;
  }
  for (const b of books) {
    const key = `${b.sourceType}#${b.sourceId}`;
    booked.set(key, (booked.get(key) ?? 0n) + b.paise);
    if (b.divisionId !== null) div(b.divisionId).booksPaise += b.paise;
    booksPaise += b.paise;
  }

  const differences: StockDifference[] = [];
  for (const key of new Set([...stock.keys(), ...booked.keys()])) {
    const s = stock.get(key) ?? 0n;
    const b = booked.get(key) ?? 0n;
    if (s === b) continue;
    const [kind, id] = key.split("#");
    const reason = !booked.has(key) ? "NOT_POSTED" : !stock.has(key) ? "BOOKS_ONLY" : "AMOUNT_DIFFERS";
    differences.push({ kind, id: Number(id), stockPaise: s, booksPaise: b, reason });
  }
  differences.sort((a, b) => a.kind.localeCompare(b.kind) || a.id - b.id);

  return {
    stockPaise, booksPaise, differencePaise: booksPaise - stockPaise,
    byDivision: [...divisions].map(([divisionId, v]) => ({ divisionId, ...v })).sort((a, b) => a.divisionId - b.divisionId),
    differences,
  };
}

export async function getStockTieOut(pool: Pool, businessId: number): Promise<StockTieOut> {
  const [mv] = await pool.execute<Row[]>(
    `SELECT source_type, source_id, division_id,
            SUM(CASE WHEN quantity_change < 0 THEN -ROUND(total_cost * 100) ELSE ROUND(total_cost * 100) END) AS paise
       FROM acct_stock_movements
      WHERE legal_business_id = ? AND movement_type NOT IN ('TRANSFER_OUT','TRANSFER_IN')
      GROUP BY source_type, source_id, division_id`,
    [businessId]
  );
  // A reversal entry is counted under the record of the entry it reverses, so a reversed and re-posted record nets out.
  const [jl] = await pool.execute<Row[]>(
    `SELECT COALESCE(orig.source_type, je.source_type) AS source_type,
            COALESCE(orig.source_id, je.source_id) AS source_id,
            l.division_id,
            SUM(ROUND(l.debit * 100) - ROUND(l.credit * 100)) AS paise
       FROM acct_journal_lines l
       JOIN acct_journal_entries je ON je.id = l.journal_entry_id AND je.legal_business_id = l.legal_business_id AND je.status = 'POSTED'
       JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.account_code = '1200'
       LEFT JOIN acct_journal_entries orig
              ON je.source_type = 'JOURNAL_REVERSAL' AND orig.id = je.source_id AND orig.legal_business_id = je.legal_business_id
      WHERE je.legal_business_id = ?
      GROUP BY COALESCE(orig.source_type, je.source_type), COALESCE(orig.source_id, je.source_id), l.division_id`,
    [businessId]
  );
  return compareStockToBooks(
    mv.map((r) => ({ sourceType: String(r.source_type), sourceId: Number(r.source_id), divisionId: Number(r.division_id), paise: BigInt(String(r.paise)) })),
    jl.map((r) => ({
      sourceType: String(r.source_type ?? "MANUAL"), sourceId: Number(r.source_id ?? 0),
      divisionId: r.division_id === null ? null : Number(r.division_id), paise: BigInt(String(r.paise)),
    }))
  );
}
