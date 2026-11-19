import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLetterPack, letterRef, salaryAnnexure, addDaysDmy } from "../src/lib/letter-pack.ts";
import { DEFAULT_TEMPLATES, DEFAULT_TERMS, renderLetter } from "../src/lib/staff-letters.ts";
import { computePayslip, DEFAULT_SETTINGS } from "../src/lib/payroll/engine.ts";

const components = [
  { code: "BASIC", name: "Basic salary", percentBps: 5000, pfWage: true, esiWage: true },
  { code: "HRA", name: "House rent allowance", percentBps: 2000, pfWage: false, esiWage: true },
  { code: "SPL", name: "Special allowance", percentBps: null, pfWage: false, esiWage: true },
];
const settings = { ...DEFAULT_SETTINGS, pf: { ...DEFAULT_SETTINGS.pf, enabled: true }, esi: { ...DEFAULT_SETTINGS.esi, enabled: true } };
const slipFor = (gross, pf = true) => computePayslip({
  month: "2026-11", monthlySalary: gross, components, daysInMonth: 30, paidDays: 30,
  person: { pfMember: pf, esiMember: true, ptApplicable: false, regime: "NEW", oldRegimeDeductions: 0n, age: 25 },
  ytd: { gross: 0n, tds: 0n, pt: 0n }, advance: 0n,
}, settings);

const ctx = {
  title: "Ms.", name: "Asha", jobTitle: "Sales Executive", salary: "18,000.00", joinedOn: "01-12-2026", noticeGivenOn: "", leftOn: "",
  letterDate: "19-11-2026", place: "Kapra", employer: "Acme Group", terms: DEFAULT_TERMS, employmentType: "FULL_TIME",
  ctc: "2,37,060.00", employeeCode: "EMP-0007", department: "Sales", reportsTo: "Shop Manager", offerValidUntil: "26-11-2026",
};
const pack = (type, extra = {}) => buildLetterPack({
  type, ctx: { ...ctx, ...extra }, dateIso: "2026-11-19", letter: DEFAULT_TEMPLATES[type],
  terms: DEFAULT_TEMPLATES[extra.employmentType === "DAILY_WAGE" ? "terms_wage" : "terms_monthly"],
  homeAddress: "Kapra, Hyderabad", phone: "9000000001", workAddress: "Shop 1, Kapra",
  annexure: { rows: salaryAnnexure(slipFor(1800000n), { bonusAnnual: 0n, gratuityAnnual: 0n }).rows, basis: [] },
});

test("joining letters are four pages: welcome, joining details, terms, annexure with acceptance", () => {
  const p = pack("appointment");
  assert.deepEqual(p.pages.map((x) => x.title), ["LETTER OF APPOINTMENT", "JOINING DETAILS", "TERMS AND CONDITIONS OF EMPLOYMENT", "SALARY ANNEXURE"]);
  assert.equal(p.ref, "HR/AL/EMP-0007/20261119");
  assert.equal(p.subject, "Letter of appointment – Sales Executive");
  assert.equal(p.pages[2].compact, true);
  const facts = p.pages[1].blocks.find((b) => b.kind === "facts").rows;
  assert.deepEqual(facts[0], ["Employee ID", "EMP-0007"]);
  assert.ok(facts.some(([k, v]) => k === "Annual cost to company" && v === "₹2,37,060.00"));
  assert.equal(p.pages[3].blocks.at(-1).kind, "accept");
  assert.ok(p.pages[0].blocks.some((b) => b.kind === "p" && b.text.includes("Your Employee ID is EMP-0007")));
});

test("daily-wage pack shows the wage and the wage terms, no probation or leave rows", () => {
  const p = pack("daily_wage_engagement", { employmentType: "DAILY_WAGE", dailyWage: "600.00" });
  assert.equal(p.pages[3].title, "PAY ANNEXURE");
  assert.equal(p.pages[2].title, "TERMS AND CONDITIONS OF ENGAGEMENT");
  const facts = p.pages[1].blocks.find((b) => b.kind === "facts").rows;
  assert.ok(facts.some(([k, v]) => k === "Daily wage" && v === "₹600.00 a day"));
  assert.ok(!facts.some(([k]) => k === "Probation" || k === "Paid leave"));
});

test("other letters are one corporate page; certificates have no addressee block", () => {
  const relieving = pack("relieving");
  assert.equal(relieving.pages.length, 1);
  assert.deepEqual(relieving.to, []);
  const warning = pack("warning", { reason: "late arrival" });
  assert.equal(warning.to[0], "Ms. Asha");
  assert.equal(warning.pages[0].blocks.at(-1).kind, "sign");
});

test("salary annexure adds up: gross, benefits, CTC and take-home", () => {
  const slip = slipFor(1800000n);
  const a = salaryAnnexure(slip, { bonusAnnual: 120000n, gratuityAnnual: 0n });
  const row = (label) => a.rows.find((r) => r.label.startsWith(label));
  assert.equal(row("Gross salary").monthly, 1800000n);
  const earnings = a.rows.slice(1, a.rows.findIndex((r) => r.label.startsWith("Gross"))).reduce((t, r) => t + r.monthly, 0n);
  assert.equal(earnings, 1800000n);
  assert.equal(a.ctcAnnual, 1800000n * 12n + row("Total benefits").annual);
  assert.equal(row("Statutory bonus").annual, 120000n);
  assert.equal(a.takeHome, 1800000n - slip.employee.pf - slip.employee.esi);
  // Not a PF member: no PF rows at all.
  const noPf = salaryAnnexure(slipFor(1800000n, false), { bonusAnnual: 0n, gratuityAnnual: 0n });
  assert.ok(!noPf.rows.some((r) => /Provident/.test(r.label)));
});

test("terms template headings become sub-headings; helpers", () => {
  const t = renderLetter(DEFAULT_TEMPLATES.terms_monthly, ctx);
  assert.equal(t.blocks[0].kind, "h");
  assert.equal(t.blocks.filter((b) => b.kind === "h").length, 15);
  assert.ok(t.blocks.some((b) => b.kind === "p" && b.text.includes("30 days' notice")));
  assert.equal(letterRef("offer", "", "2026-11-19"), "HR/OL/NEW/20261119");
  assert.equal(addDaysDmy("2026-11-28", 7), "05-12-2026");
});
