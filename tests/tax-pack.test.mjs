import test from "node:test";
import assert from "node:assert/strict";

import { estimateTax, planInstalments, projectYearProfit, instalmentDates } from "../src/lib/tax/advance-tax.ts";
import { blockYear, daysInUse, itDepreciation } from "../src/lib/tax/it-depreciation.ts";
import { loanSchedule, monthlyInstalment, yearTotals } from "../src/lib/tax/loan-schedule.ts";
import { matchChallans, parseStatement, statementDate } from "../src/lib/tax/form168.ts";
import { formNames, returnDueDate, taxYearLabel, taxYearOf } from "../src/lib/tax/tax-year.ts";
import { monthTotals, panOf, taxYearMonths } from "../src/lib/tax/year-figures.ts";
import { annualTax } from "../src/lib/payroll/engine.ts";
import { TAX_YEARS } from "../src/lib/payroll/rules.ts";
import { parseRupees } from "../src/lib/reports/money.ts";

const R = (n) => BigInt(Math.round(n * 100));

test("tax year and form names", () => {
  assert.equal(taxYearOf("2026-11-18"), 2026);
  assert.equal(taxYearOf("2027-03-31"), 2026);
  assert.equal(taxYearOf("2026-04-01"), 2026);
  assert.equal(taxYearLabel(2026), "2026-27");
  assert.match(formNames(2026).statement, /Form 168/);
  assert.equal(formNames(2025).statement, "Form 26AS");
  assert.equal(returnDueDate(2026, false), "2027-07-31");
  assert.equal(returnDueDate(2026, true), "2027-10-31");
});

test("old regime has no marginal relief just above ₹5 lakh", () => {
  const old = TAX_YEARS["2026"].OLD;
  // ₹5,10,000: 12,500 on the first 5 lakh slab part + 20% of 10,000 = 14,500; plus 4% cess = 15,080
  assert.equal(annualTax(R(510000), old, 4), R(15080));
  // New regime keeps marginal relief: ₹12,10,000 -> tax limited to the ₹10,000 above the limit, plus cess
  assert.equal(annualTax(R(1210000), TAX_YEARS["2026"].NEW, 4), R(10400));
});

test("tax estimate by kind of business", () => {
  const owner = estimateTax({ legalForm: "PROPRIETORSHIP", income: R(1500000), taxYear: 2026 });
  // New regime: 4-8L 5% = 20,000; 8-12L 10% = 40,000; 12-15L 15% = 45,000 -> 1,05,000 + 4% = 1,09,200
  assert.equal(owner.total, R(109200));
  const firm = estimateTax({ legalForm: "PARTNERSHIP", income: R(1000000), taxYear: 2026 });
  assert.equal(firm.total, R(312000));
  const company = estimateTax({ legalForm: "COMPANY", income: R(1000000), taxYear: 2026, companyScheme: "22" });
  // 22% + 10% surcharge + 4% cess = 25.168%
  assert.equal(company.total, R(251680));
  assert.equal(estimateTax({ legalForm: "COMPANY", income: R(-5000), taxYear: 2026 }).total, 0n);
  const rich = estimateTax({ legalForm: "PROPRIETORSHIP", income: R(6000000), taxYear: 2026 });
  assert.ok(rich.surcharge > 0n && rich.approximate);
});

test("projecting the year's profit from the months so far", () => {
  const half = projectYearProfit(R(500000), 2026, "2026-09-30");
  assert.ok(half.projected > R(990000) && half.projected < R(1010000));
  assert.equal(projectYearProfit(R(100), 2026, "2027-06-01").projected, R(100));
});

test("instalment plan: dates, shortfall, next to pay, interest", () => {
  assert.equal(instalmentDates(2026, true).length, 1);
  const plan = planInstalments({
    taxYear: 2026,
    netTax: R(100000),
    presumptive: false,
    payments: [{ date: "2026-06-10", amount: R(15000) }, { date: "2026-09-20", amount: R(20000) }],
    today: "2026-11-18",
  });
  assert.deepEqual(plan.rows.map((r) => r.status), ["PAID", "SHORT", "NEXT", "LATER"]);
  assert.equal(plan.rows[1].shortfall, R(30000)); // 45,000 due, 15,000 paid by 15 Sep
  assert.equal(plan.rows[1].interest, R(900)); // 1% x 3 months on 30,000
  assert.equal(plan.next.due, "2026-12-15");
  assert.equal(plan.next.amount, R(40000)); // 75,000 less 35,000 paid
  const small = planInstalments({ taxYear: 2026, netTax: R(9000), presumptive: false, payments: [], today: "2026-11-18" });
  assert.ok(small.notRequired);
  assert.equal(small.next, null);
  // Paying 12% by June is tolerated: no interest for the first instalment
  const tol = planInstalments({ taxYear: 2026, netTax: R(100000), presumptive: false, payments: [{ date: "2026-06-01", amount: R(12000) }], today: "2026-07-01" });
  assert.equal(tol.rows[0].status, "SHORT");
  assert.equal(tol.rows[0].interest, 0n);
});

test("income-tax depreciation: full and half rate, sale, capital gain", () => {
  assert.equal(daysInUse("2026-10-03", 2026), 180);
  assert.equal(daysInUse("2026-10-04", 2026), 179);
  const y = blockYear({ block: "COMPUTERS", ratePct: 40, opening: R(100000), additionsFull: R(50000), additionsHalf: R(20000), sales: R(10000) });
  // (1,00,000 + 50,000 - 10,000) x 40% = 56,000; 20,000 x 20% = 4,000
  assert.equal(y.depreciation, R(60000));
  assert.equal(y.closing, R(100000));
  const gain = blockYear({ block: "VEHICLE", ratePct: 15, opening: R(40000), additionsFull: 0n, additionsHalf: 0n, sales: R(55000) });
  assert.equal(gain.capitalGain, R(15000));
  assert.equal(gain.depreciation, 0n);
  assert.equal(gain.closing, 0n);
  const roll = itDepreciation({
    assets: [{ block: "FURNITURE_FITTINGS", purchaseDate: "2026-05-01", cost: R(100000), disposedOn: null, proceeds: 0n }],
    opening: null,
    taxYear: 2027,
  });
  const f = roll.rows.find((r) => r.block === "FURNITURE_FITTINGS");
  assert.equal(f.opening, R(90000)); // 10% taken in 2026-27
  assert.equal(f.depreciation, R(9000));
  const withOpening = itDepreciation({ assets: [], opening: { taxYear: 2026, wdv: { MACHINERY: R(200000) } }, taxYear: 2026 });
  assert.equal(withOpening.rows.find((r) => r.block === "MACHINERY").depreciation, R(30000));
});

test("loan schedule and the year's interest", () => {
  const emi = monthlyInstalment(R(500000), 1200, 24);
  assert.equal(emi, R(23537)); // ₹5 lakh, 12%, 2 years
  const rows = loanSchedule({ principal: R(500000), rateBps: 1200, months: 24, firstMonth: "2026-05" });
  assert.equal(rows.length, 24);
  assert.equal(rows[0].interest, R(5000));
  assert.equal(rows[23].closing, 0n);
  assert.equal(rows.reduce((t, r) => t + r.principal, 0n), R(500000));
  const y = yearTotals(rows, 2026); // May 2026 to March 2027 = 11 instalments
  assert.equal(y.instalments, 11);
  assert.equal(y.opening, R(500000));
  assert.ok(y.interest > R(40000) && y.interest < R(50000));
});

test("reading the annual tax statement and matching challans", () => {
  const text = [
    "Sr. No.^Name of Deductor^TAN of Deductor^^^^Total Amount Paid / Credited(Rs.)^Total Tax Deducted(Rs.)^Total TDS Deposited(Rs.)",
    "1^BIG RETAIL PRIVATE LIMITED^HYDB12345C^^^^2,50,000.00^25,000.00^25,000.00",
    "Sr. No.^Major Head^Minor Head^Tax(Rs.)^Surcharge(Rs.)^Education Cess(Rs.)^Others(Rs.)^Total Tax(Rs.)^BSR Code^Date of Deposit^Challan Serial Number^Remarks",
    "1^0021^100^15000.00^0.00^0.00^0.00^15000.00^0510308^14-Jun-2026^00012^",
    "2^0021^100^20000.00^0.00^0.00^0.00^20000.00^0510308^20-Sep-2026^00044^",
  ].join("\n");
  const s = parseStatement(text);
  assert.equal(s.tds.length, 1);
  assert.equal(s.tds[0].tan, "HYDB12345C");
  assert.equal(s.tds[0].tds, R(25000));
  assert.equal(s.taxPaid.length, 2);
  assert.equal(s.taxPaid[0].date, "2026-06-14");
  assert.equal(s.taxPaid[0].minorHead, "100");
  const m = matchChallans(
    [
      { id: 1, paidOn: "2026-06-14", amount: R(15000), bsrCode: "0510308", serial: "12" },
      { id: 2, paidOn: "2026-12-10", amount: R(40000), bsrCode: null, serial: null },
    ],
    s.taxPaid
  );
  assert.equal(m.matched.length, 1);
  assert.equal(m.onlyInBooks[0].id, 2);
  assert.equal(m.onlyInStatement[0].serial, "00044");
  assert.equal(statementDate("05/03/2027"), "2027-03-05");
  assert.equal(parseRupees("₹ 1,23,456.7"), R(123456.7));
  assert.equal(parseRupees("abc"), null);
});

test("year figures: months, totals, PAN from GSTIN", () => {
  assert.equal(taxYearMonths(2026)[0], "2026-04");
  assert.equal(taxYearMonths(2026)[11], "2027-03");
  const t = monthTotals([{ date: "2026-04-05", v: R(10) }, { date: "2026-04-30", v: R(5) }, { date: "2027-04-01", v: R(99) }], 2026, (p) => p.v);
  assert.equal(t[0].amount, R(15));
  assert.equal(t.reduce((a, r) => a + r.amount, 0n), R(15));
  assert.deepEqual(panOf(null, "36ABCDE1234F1Z5"), { pan: "ABCDE1234F", fromGstin: true });
  assert.deepEqual(panOf("abcde1234f", null), { pan: "ABCDE1234F", fromGstin: false });
  assert.deepEqual(panOf("", ""), { pan: null, fromGstin: false });
});

test("reminder for the next advance tax date", async () => {
  const { upcomingInstalment } = await import("../src/lib/tax/advance-tax.ts");
  assert.deepEqual(upcomingInstalment("2026-12-08", false), { due: "2026-12-15", days: 7 });
  assert.equal(upcomingInstalment("2026-11-18", false), null);
  assert.equal(upcomingInstalment("2026-12-08", true), null);
  assert.deepEqual(upcomingInstalment("2027-03-10", true), { due: "2027-03-15", days: 5 });
});
