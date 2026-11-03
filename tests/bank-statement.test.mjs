import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseBankDate, parseAmountPaise, readStatement, matchStatement } from "../src/lib/bank-statement.ts";

test("dates", () => {
  assert.equal(parseBankDate("03/11/2026"), "2026-11-03");
  assert.equal(parseBankDate("3-Nov-26"), "2026-11-03");
  assert.equal(parseBankDate("03 Nov 2026"), "2026-11-03");
  assert.equal(parseBankDate("2026-11-03"), "2026-11-03");
  assert.equal(parseBankDate("31/02/2026"), null);
  assert.equal(parseBankDate("Opening"), null);
});
test("amounts", () => {
  assert.equal(parseAmountPaise("1,41,525.00"), 14152500);
  assert.equal(parseAmountPaise("(500)"), -50000);
  assert.equal(parseAmountPaise("500.50 Dr"), 50050);
  assert.equal(parseAmountPaise(""), 0);
  assert.equal(parseAmountPaise("abc"), null);
});
test("csv with quotes", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y",2\n'), [["a", "b"], ["x, y", "2"]]);
});
test("withdrawal/deposit statement", () => {
  const csv = `Account Statement,,,,\nDate,Narration,Chq/Ref,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/11/26,"UPI-RAVI TEXTILES",1,"1,41,525.00",,"10,000.00"\n02/11/26,CASH DEP,2,,5000.00,15000.00\nTotal,,,,,\n`;
  const r = readStatement(csv);
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].moneyOut, 14152500);
  assert.equal(r.lines[1].moneyIn, 500000);
  assert.equal(r.lines[1].balance, 1500000);
});
test("single amount with Dr/Cr column", () => {
  const r = readStatement("Date,Description,Amount,Dr/Cr\n01-11-2026,A,100.00,DR\n02-11-2026,B,50.00,CR\n");
  assert.equal(r.lines[0].moneyOut, 10000);
  assert.equal(r.lines[1].moneyIn, 5000);
});
test("no header gives an error", () => {
  assert.ok(readStatement("hello\nworld").error);
});
test("matching: amount, direction, date window, one-to-one", () => {
  const lines = [
    { date: "2026-11-01", description: "a", moneyOut: 100, moneyIn: 0, balance: null },
    { date: "2026-11-02", description: "b", moneyOut: 100, moneyIn: 0, balance: null },
    { date: "2026-11-02", description: "c", moneyOut: 0, moneyIn: 500, balance: null },
  ];
  const books = [
    { id: 1, date: "2026-11-02", description: "", debit: 0, credit: 100 },
    { id: 2, date: "2026-11-20", description: "", debit: 500, credit: 0 },
  ];
  const m = matchStatement(lines, books);
  assert.deepEqual(m, [{ statementIndex: 1, bookId: 1 }]);
});
