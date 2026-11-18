import test from "node:test";
import assert from "node:assert/strict";

import { compositionTax, creditShare, divRound, expenseTax, purchaseTax, purchaseTreatment, rateForPiece, returnTax, saleTax, setOff, shareOut, taxInside, taxOnTop } from "../src/lib/gst/engine.ts";
import { buildGstr1, buildGstr3b, periodRange } from "../src/lib/gst/returns.ts";

const R = (n) => BigInt(Math.round(n * 100));
const GARMENT = { rate: 5, highRate: 18, limit: R(2500) };

test("tax inside a price, rounding", () => {
  assert.deepEqual(taxInside(R(1050), 5), { taxable: R(1000), tax: R(50) });
  assert.deepEqual(taxInside(R(100), 5), { taxable: R(95.24), tax: R(4.76) });
  assert.equal(taxOnTop(R(1000), 18), R(180));
  assert.equal(divRound(5n, 2n), 3n);
  assert.equal(divRound(-5n, 2n), -3n);
  assert.deepEqual(shareOut(R(10), [1n, 1n, 1n]), [R(3.33), R(3.33), R(3.34)]);
});

test("garment price rule: 5% up to Rs 2,500 a piece before GST, 18% above", () => {
  assert.equal(rateForPiece(GARMENT, R(2625)), 5); // 2,500 + 5%
  assert.equal(rateForPiece(GARMENT, R(2626)), 18);
  assert.equal(rateForPiece({ rate: 5 }, R(99999)), 5);
});

test("sale: same state splits CGST/SGST, bill discount shared, delivery at the top rate", () => {
  const t = saleTax({
    scheme: "REGULAR",
    sameState: true,
    billDiscount: R(100),
    shipping: R(118),
    lines: [
      { lineTotal: R(1050), qtyMilli: 1000n, rule: GARMENT, hsn: "6204" },
      { lineTotal: R(3540), qtyMilli: 1000n, rule: GARMENT, hsn: "6204" },
    ],
  });
  assert.equal(t.kind, "TAX_INVOICE");
  assert.equal(t.lines[0].rate, 5);
  assert.equal(t.lines[1].rate, 18);
  assert.equal(t.lines[0].billDiscount + t.lines[1].billDiscount, R(100));
  assert.equal(t.shipping.rate, 18);
  assert.equal(t.shipping.cgst + t.shipping.sgst, R(18));
  assert.equal(t.total.igst, 0n);
  // Everything adds back to what the customer pays
  const paid = R(1050) + R(3540) - R(100) + R(118);
  assert.equal(t.taxable + t.total.cgst + t.total.sgst, paid);
  const other = saleTax({ scheme: "REGULAR", sameState: false, billDiscount: 0n, shipping: 0n, lines: [{ lineTotal: R(1050), qtyMilli: 1000n, rule: GARMENT, hsn: "6204" }] });
  assert.equal(other.total.igst, R(50));
  const comp = saleTax({ scheme: "COMPOSITION", sameState: true, billDiscount: 0n, shipping: 0n, lines: [{ lineTotal: R(1050), qtyMilli: 1000n, rule: GARMENT, hsn: null }] });
  assert.equal(comp.kind, "BILL_OF_SUPPLY");
  assert.equal(comp.total.cgst, 0n);
  const off = saleTax({ scheme: "NOT_REGISTERED", sameState: true, billDiscount: 0n, shipping: 0n, lines: [{ lineTotal: R(1050), qtyMilli: 1000n, rule: GARMENT, hsn: null }] });
  assert.equal(off.kind, "PLAIN");
  const missing = saleTax({ scheme: "REGULAR", sameState: true, billDiscount: 0n, shipping: 0n, lines: [{ lineTotal: R(500), qtyMilli: 2000n, rule: { rate: null }, hsn: null }] });
  assert.equal(missing.missingRate, 1);
});

test("price rule is per piece: four Rs 2,200 pieces are all 5%", () => {
  const t = saleTax({ scheme: "REGULAR", sameState: true, billDiscount: 0n, shipping: 0n, lines: [{ lineTotal: R(8800), qtyMilli: 4000n, rule: GARMENT, hsn: "6211" }] });
  assert.equal(t.lines[0].rate, 5);
});

test("credit note tax on a return", () => {
  const r = returnTax({ sameState: true, lines: [{ refund: R(1050), rate: 5 }], delivery: R(118), deliveryRate: 18 });
  assert.equal(r.goods.cgst + r.goods.sgst, R(50));
  assert.equal(r.delivery.cgst + r.delivery.sgst, R(18));
});

test("purchases: only a regular GST supplier gives input credit; bill tax overrides", () => {
  assert.equal(purchaseTreatment({ scheme: "REGULAR", supplierGstin: null, supplierComposition: false }), "UNREGISTERED");
  assert.equal(purchaseTreatment({ scheme: "REGULAR", supplierGstin: "36ABCDE1234F1Z5", supplierComposition: true }), "COMPOSITION");
  assert.equal(purchaseTreatment({ scheme: "COMPOSITION", supplierGstin: "36ABCDE1234F1Z5", supplierComposition: false }), "NONE");
  const lines = [{ amount: R(10500), qtyMilli: 10000n, rule: { rate: 5 } }, { amount: R(5900), qtyMilli: 1000n, rule: { rate: 18 } }];
  const p = purchaseTax({ treatment: "REGULAR", sameState: true, lines });
  assert.equal(p.total.cgst + p.total.sgst, R(500) + R(900));
  const typed = purchaseTax({ treatment: "REGULAR", sameState: false, lines, billTax: R(1400.02) });
  assert.equal(typed.total.igst, R(1400.02));
  assert.equal(purchaseTax({ treatment: "UNREGISTERED", sameState: true, lines }).total.cgst, 0n);
  assert.deepEqual(creditShare({ amount: R(10500), credit: { cgst: R(250), sgst: R(250), igst: 0n } }, R(5250)), { cgst: R(125), sgst: R(125), igst: 0n });
});

test("expenses: credit inside the bill, or reverse charge on top", () => {
  assert.deepEqual(expenseTax({ mode: "ITC", amount: R(1180), rate: 18, sameState: true }), { cgst: R(90), sgst: R(90), igst: 0n });
  assert.deepEqual(expenseTax({ mode: "RCM", amount: R(10000), rate: 18, sameState: true }), { cgst: R(900), sgst: R(900), igst: 0n });
  assert.deepEqual(expenseTax({ mode: "NONE", amount: R(10000), rate: 18, sameState: true }), { cgst: 0n, sgst: 0n, igst: 0n });
});

test("set-off order: IGST credit first, CGST and SGST never cross", () => {
  const s = setOff({ cgst: R(1000), sgst: R(1000), igst: R(500) }, { cgst: R(300), sgst: R(1500), igst: R(800) });
  assert.equal(s.used.igst.igst, R(500));
  assert.equal(s.used.igst.cgst, R(300));
  assert.equal(s.used.cgst.cgst, R(300));
  assert.equal(s.used.sgst.sgst, R(1000));
  assert.equal(s.used.sgst.cgst ?? 0n, 0n);
  assert.deepEqual(s.cash, { cgst: R(400), sgst: 0n, igst: 0n });
  assert.equal(s.creditLeft.sgst, R(500));
  assert.deepEqual(compositionTax(R(1000000), 1), { cgst: R(5000), sgst: R(5000), igst: 0n });
});

test("GSTR-1 buckets and GSTR-3B", () => {
  const row = (rate, taxable, tax, sameState = true, hsn = "6204", qty = 1) => ({ rate, taxable, hsn, qty, cgst: sameState ? tax / 2n : 0n, sgst: sameState ? tax - tax / 2n : 0n, igst: sameState ? 0n : tax });
  const g = buildGstr1({
    homeState: "36",
    invoices: [
      { no: "SA-1", date: "2027-04-02", buyerGstin: "36ABCDE1234F1Z5", buyerName: "Big Retail", pos: "36", value: R(10500), rows: [row(5, R(10000), R(500))] },
      { no: "SA-2", date: "2027-04-03", buyerGstin: null, buyerName: "Walk-in", pos: "36", value: R(1050), rows: [row(5, R(1000), R(50))] },
      { no: "SA-3", date: "2027-04-04", buyerGstin: null, buyerName: "Online", pos: "29", value: R(118000), rows: [row(18, R(100000), R(18000), false)] },
      { no: "SA-4", date: "2027-04-05", buyerGstin: null, buyerName: "Online", pos: "29", value: R(1050), rows: [row(5, R(1000), R(50), false)] },
    ],
    creditNotes: [{ no: "CN-1", date: "2027-04-06", invoiceNo: "SA-2", invoiceDate: "2027-04-03", buyerGstin: null, buyerName: "Walk-in", pos: "36", value: R(525), rows: [row(5, R(500), R(25))] }],
  });
  assert.equal(g.b2b.length, 1);
  assert.equal(g.b2cl.length, 1);
  assert.equal(g.b2cs.length, 2);
  assert.equal(g.b2cs.find((b) => b.pos === "36").taxable, R(500)); // 1,000 sold less 500 returned
  assert.equal(g.hsn.b2b[0].taxable, R(10000));
  assert.equal(g.docs.invoices.count, 4);
  const b = buildGstr3b({
    gstr1: g,
    homeState: "36",
    inward: [
      { kind: "PURCHASE", treatment: "REGULAR", value: R(50000), credit: { cgst: R(1250), sgst: R(1250), igst: 0n }, rcm: { cgst: 0n, sgst: 0n, igst: 0n } },
      { kind: "EXPENSE", treatment: "RCM", value: R(10000), credit: { cgst: R(900), sgst: R(900), igst: 0n }, rcm: { cgst: R(900), sgst: R(900), igst: 0n } },
      { kind: "PURCHASE", treatment: "UNREGISTERED", value: R(20000), credit: { cgst: 0n, sgst: 0n, igst: 0n }, rcm: { cgst: 0n, sgst: 0n, igst: 0n } },
    ],
  });
  assert.equal(b.outward.taxable, R(10000) + R(1000) + R(100000) + R(1000) - R(500));
  assert.equal(b.interStateUnregistered.find((x) => x.pos === "29").igst, R(18050));
  assert.equal(b.rcmCash, R(1800));
  assert.equal(b.inwardUnregistered, R(20000));
  assert.ok(b.cashTotal > 0n);
});

test("return periods", () => {
  assert.deepEqual(periodRange("MONTH", "2027-02"), { from: "2027-02-01", to: "2027-02-28", label: "Feb 2027" });
  assert.equal(periodRange("QUARTER", "2027-05").from, "2027-04-01");
  assert.equal(periodRange("QUARTER", "2027-05").to, "2027-06-30");
  assert.equal(periodRange("QUARTER", "2027-02").from, "2027-01-01");
  assert.equal(periodRange("QUARTER", "2027-02").to, "2027-03-31");
});

test("unit cost to 4 decimals", async () => {
  const { unitCost4 } = await import("../src/lib/gst/engine.ts");
  assert.equal(unitCost4(R(100), 3000n), "33.3333");
  assert.equal(unitCost4(R(1050), 1000n), "1050.0000");
});
