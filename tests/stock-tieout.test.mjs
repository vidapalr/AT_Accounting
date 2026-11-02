import test from "node:test";
import assert from "node:assert/strict";
import { compareStockToBooks, booksKind } from "../src/lib/ledger/stock-tieout.ts";

const move = (sourceType, sourceId, paise, divisionId = 1) => ({ sourceType, sourceId, divisionId, paise: BigInt(paise) });
const book = (sourceType, sourceId, paise, divisionId = 1) => ({ sourceType, sourceId, divisionId, paise: BigInt(paise) });

test("matching stock and books give no differences", () => {
  const r = compareStockToBooks(
    [move("PURCHASE", 7, 100000), move("SALES_INVOICE", 3, -40000)],
    [book("PURCHASE_RECEIPT", 7, 100000), book("SALES_INVOICE", 3, -40000)]
  );
  assert.equal(r.differences.length, 0);
  assert.equal(r.differencePaise, 0n);
  assert.equal(r.stockPaise, 60000n);
});

test("an edited bill and a cancelled damage net out under their own record", () => {
  assert.equal(booksKind("SALES_INVOICE_EDIT"), "SALES_INVOICE");
  assert.equal(booksKind("STOCK_DAMAGE_CANCEL"), "STOCK_DAMAGE");
  const r = compareStockToBooks(
    [move("SALES_INVOICE", 5, -10840), move("SALES_INVOICE_EDIT", 5, 5420), move("STOCK_DAMAGE", 4, -184), move("STOCK_DAMAGE_CANCEL", 4, 184)],
    [book("SALES_INVOICE", 5, -5420)]
  );
  assert.equal(r.differences.length, 0);
});

test("stock that moved but is not in the books is NOT_POSTED, with the amount", () => {
  const r = compareStockToBooks([move("PURCHASE", 9, 50000)], []);
  assert.deepEqual(r.differences.map((d) => [d.kind, d.id, d.reason, d.stockPaise, d.booksPaise]), [["PURCHASE_RECEIPT", 9, "NOT_POSTED", 50000n, 0n]]);
  assert.equal(r.differencePaise, -50000n);
});

test("opening stock in the books with no stock record is BOOKS_ONLY", () => {
  const r = compareStockToBooks([], [book("OPENING_BALANCE", 1, 250000)]);
  assert.equal(r.differences[0].reason, "BOOKS_ONLY");
  assert.equal(r.differencePaise, 250000n);
});

test("both sides exist but differ is AMOUNT_DIFFERS, and divisions are totalled", () => {
  const r = compareStockToBooks(
    [move("PURCHASE", 1, 100000, 1), move("PURCHASE", 2, 30000, 2)],
    [book("PURCHASE_RECEIPT", 1, 90000, 1), book("PURCHASE_RECEIPT", 2, 30000, 2)]
  );
  assert.equal(r.differences.length, 1);
  assert.equal(r.differences[0].reason, "AMOUNT_DIFFERS");
  assert.deepEqual(r.byDivision.map((d) => [d.divisionId, d.stockPaise, d.booksPaise]), [[1, 100000n, 90000n], [2, 30000n, 30000n]]);
});
