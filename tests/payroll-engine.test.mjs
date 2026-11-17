import test from "node:test";
import assert from "node:assert/strict";
import { computePayslip, DEFAULT_SETTINGS, annualTax, monthsLeftInFy, pfCeiling, defaultPaidDays, ageAt, splitSalary, fyStartOf } from "../src/lib/payroll/engine.ts";
import { TAX_YEARS, PT_PRESETS, parsePtSlabs, formatPtSlabs, R } from "../src/lib/payroll/rules.ts";

const on = {
  ...DEFAULT_SETTINGS,
  pf: { ...DEFAULT_SETTINGS.pf, enabled: true },
  esi: { ...DEFAULT_SETTINGS.esi, enabled: true },
  pt: { enabled: true, slabs: PT_PRESETS.TELANGANA.slabs },
  tds: { enabled: true },
};
const comps = [
  { code: "BASIC", name: "Basic", percentBps: 5000, pfWage: true, esiWage: true },
  { code: "HRA", name: "HRA", percentBps: 2000, pfWage: false, esiWage: true },
  { code: "SPECIAL", name: "Special allowance", percentBps: null, pfWage: false, esiWage: true },
];
const person = { pfMember: true, esiMember: true, ptApplicable: true, regime: "NEW", oldRegimeDeductions: 0n, age: 30 };
const base = { month: "2026-10", monthlySalary: R(20000), components: comps, daysInMonth: 31, paidDays: 31, person, ytd: { gross: 0n, tds: 0n, pt: 0n }, advance: 0n };
const rs = (p) => Number(p) / 100;

test("a Rs 20,000 salary in Telangana: PF, ESI, PT, no income tax", () => {
  const s = computePayslip(base, on);
  assert.deepEqual(s.earnings.map((e) => rs(e.earned)), [10000, 4000, 6000]);
  assert.equal(rs(s.gross), 20000);
  assert.equal(rs(s.employee.pf), 1200);      // 12% of PF wages 10,000
  assert.equal(rs(s.employer.eps), 833);      // 8.33%
  assert.equal(rs(s.employer.epf), 367);      // 12% less EPS
  assert.equal(rs(s.employer.edli), 50);
  assert.equal(rs(s.employer.pfAdmin), 50);
  assert.equal(rs(s.employee.esi), 150);      // 0.75%
  assert.equal(rs(s.employer.esi), 650);      // 3.25%
  assert.equal(rs(s.employee.pt), 150);       // Telangana 15,001-20,000
  assert.equal(rs(s.employee.tds), 0);        // under the Rs 12 lakh rebate
  assert.equal(rs(s.net), 20000 - 1200 - 150 - 150);
  assert.equal(rs(s.employerCost), 833 + 367 + 50 + 50 + 650);
});

test("statutory switches off by default: gross equals net", () => {
  const s = computePayslip({ ...base, advance: R(2000) }, DEFAULT_SETTINGS);
  assert.equal(rs(s.totalDeductions), 2000);
  assert.equal(rs(s.net), 18000);
  assert.equal(s.employerCost, 0n);
});

test("half a month worked pays half; NCP days are the unpaid days", () => {
  const s = computePayslip({ ...base, month: "2026-11", daysInMonth: 30, paidDays: 15 }, on);
  assert.equal(rs(s.gross), 10000);
  assert.equal(s.ncpDays, 15);
});

test("PF ceiling: Rs 15,000 before 17 Sep 2026, Rs 25,000 after", () => {
  assert.equal(rs(pfCeiling("2026-08")), 15000);
  assert.equal(rs(pfCeiling("2026-10")), 25000);
  const all = [{ code: "BASIC", name: "Basic", percentBps: null, pfWage: true, esiWage: true }];
  const aug = computePayslip({ ...base, month: "2026-08", monthlySalary: R(40000), components: all }, on);
  assert.equal(rs(aug.employee.pf), 1800);
  const oct = computePayslip({ ...base, monthlySalary: R(40000), components: all }, on);
  assert.equal(rs(oct.employee.pf), 3000);
  assert.equal(rs(oct.employer.eps), 2083);
  assert.equal(oct.wages.esi, 0n); // above the ESI limit
});

test("over 58: no pension share", () => {
  const s = computePayslip({ ...base, person: { ...person, age: 58 } }, on);
  assert.equal(s.employer.eps, 0n);
  assert.equal(rs(s.employer.epf), 1200);
});

test("ESI low daily wage: employer pays, employee does not", () => {
  const s = computePayslip({ ...base, monthlySalary: R(5000), month: "2026-11", daysInMonth: 30, paidDays: 30 }, on);
  assert.equal(s.employee.esi, 0n);
  assert.equal(rs(s.employer.esi), 163); // 3.25% of 5,000 = 162.50, rounded up
});

test("income tax: new regime slabs, rebate, marginal relief, cess (FY 2026-27)", () => {
  const rule = TAX_YEARS["2026"].NEW;
  assert.equal(rs(annualTax(R(1200000), rule, 4)), 0);
  assert.equal(rs(annualTax(R(1210000), rule, 4)), 10400); // relief caps tax at income above 12 lakh
  assert.equal(rs(annualTax(R(1725000), rule, 4)), 150800);
  const s = computePayslip({ ...base, month: "2026-04", daysInMonth: 30, paidDays: 30, monthlySalary: R(150000) }, on);
  assert.equal(rs(s.employee.tds), 12567); // 1,50,800 over 12 months
  assert.equal(TAX_YEARS["2026"].certificate, "Form 130");
});

test("tax already deducted is spread over the months left", () => {
  const s = computePayslip({ ...base, month: "2027-01", monthlySalary: R(150000), ytd: { gross: R(1350000), tds: R(113103), pt: R(1800) } }, on);
  assert.equal(monthsLeftInFy("2027-01"), 3);
  assert.equal(rs(s.employee.tds), Math.round((150800 - 113103) / 3));
});

test("advance is cut back so pay is never negative", () => {
  const s = computePayslip({ ...base, advance: R(50000) }, on);
  assert.equal(s.net, 0n);
  assert.ok(s.notes.some((n) => n.includes("advance")));
});

test("helpers: months left, financial year, days paid, age, salary split", () => {
  assert.equal(monthsLeftInFy("2026-04"), 12);
  assert.equal(monthsLeftInFy("2027-03"), 1);
  assert.equal(fyStartOf("2027-02"), 2026);
  assert.equal(defaultPaidDays("2026-11", "2026-11-10", null), 21);
  assert.equal(defaultPaidDays("2026-11", null, "2026-11-05"), 5);
  assert.equal(defaultPaidDays("2026-11", "2026-12-01", null), 0);
  assert.equal(ageAt("2026-11", "1968-11-30"), 58);
  assert.equal(ageAt("2026-11", "1968-12-01"), 57);
  assert.deepEqual(splitSalary(R(10001), comps).map((x) => rs(x.full)), [5001, 2000, 3000]);
});

test("professional tax slabs read and written as text", () => {
  const s = parsePtSlabs("7500=0; 10000=175; *=200/300");
  assert.equal(s.length, 3);
  assert.equal(formatPtSlabs(s), "7500=0; 10000=175; *=200/300");
  assert.equal(parsePtSlabs("10000=1; 5000=2; *=3"), null);
  assert.equal(parsePtSlabs("10000=1"), null);
  const feb = computePayslip({ ...base, month: "2027-02", daysInMonth: 28, paidDays: 28, monthlySalary: R(12000) }, { ...on, pt: { enabled: true, slabs: s } });
  assert.equal(rs(feb.employee.pt), 300);
});
