import test from "node:test";
import assert from "node:assert/strict";
import { PAPER_KINDS, aadhaarLast4, folderOf, isPaperKind, letterKindFor, missingPapers, paperLabel } from "../src/lib/staff-papers.ts";
import { monthlyGrossFor, DEFAULT_NORMAL_MONTH, ctcFromGross, DEFAULT_CTC_OPTIONS } from "../src/lib/payroll/ctc.ts";
import { DEFAULT_SETTINGS } from "../src/lib/payroll/engine.ts";
import { R } from "../src/lib/payroll/rules.ts";

test("every paper kind has a folder and a label", () => {
  for (const k of PAPER_KINDS) {
    assert.ok(["PERSONAL", "OFFICIAL"].includes(k.folder), k.key);
    assert.equal(folderOf(k.key), k.folder);
    assert.equal(paperLabel(k.key), k.label);
    assert.ok(isPaperKind(k.key));
  }
  assert.ok(!isPaperKind("SOMETHING_ELSE"));
  assert.equal(paperLabel("SOMETHING_ELSE"), "SOMETHING_ELSE");
});

test("the letter that fits the type of work", () => {
  assert.equal(letterKindFor("FULL_TIME"), "APPOINTMENT_LETTER");
  assert.equal(letterKindFor("PART_TIME"), "APPOINTMENT_LETTER");
  assert.equal(letterKindFor("DAILY_WAGE"), "ENGAGEMENT_LETTER");
  assert.equal(letterKindFor("HOURLY"), "ENGAGEMENT_LETTER");
  assert.equal(letterKindFor(null), "APPOINTMENT_LETTER");
});

test("papers still to take", () => {
  assert.deepEqual(missingPapers([], "FULL_TIME").map((k) => k.key), ["AADHAAR", "PAN", "APPOINTMENT_LETTER"]);
  assert.deepEqual(missingPapers(["AADHAAR"], "FULL_TIME").map((k) => k.key), ["PAN", "APPOINTMENT_LETTER"]);
  // A wage worker is asked for an engagement letter only, not both kinds of letter.
  assert.deepEqual(missingPapers([], "HOURLY").map((k) => k.key), ["AADHAAR", "PAN", "ENGAGEMENT_LETTER"]);
  assert.deepEqual(missingPapers([], "DAILY_WAGE").map((k) => k.key), ["AADHAAR", "PAN", "ENGAGEMENT_LETTER"]);
  // An engagement letter counts as the appointment letter for a wage worker, and the other way round.
  assert.deepEqual(missingPapers(["AADHAAR", "PAN", "ENGAGEMENT_LETTER"], "DAILY_WAGE"), []);
  assert.deepEqual(missingPapers(["AADHAAR", "PAN", "APPOINTMENT_LETTER"], "HOURLY"), []);
  assert.deepEqual(missingPapers(["AADHAAR", "PAN", "ENGAGEMENT_LETTER"], "FULL_TIME"), []);
  // Papers nobody has to give do not appear.
  assert.ok(!missingPapers([], "FULL_TIME").some((k) => k.key === "PHOTO"));
});

test("only the last four digits of an Aadhaar are kept", () => {
  assert.equal(aadhaarLast4("1234 5678 9012"), "9012");
  assert.equal(aadhaarLast4("123456789012"), "9012");
  assert.equal(aadhaarLast4("1234-5678-9012"), "9012");
  assert.equal(aadhaarLast4("12345"), null);
  assert.equal(aadhaarLast4("1234567890123"), null);
  assert.equal(aadhaarLast4(""), null);
});

test("a normal month's pay for every type of work", () => {
  const pay = { monthlySalary: R(20000), dailyWage: R(600), hourlyRate: R(80) };
  assert.equal(monthlyGrossFor("FULL_TIME", pay), R(20000));
  assert.equal(monthlyGrossFor("PART_TIME", pay), R(20000));
  assert.equal(monthlyGrossFor("DAILY_WAGE", pay), R(600 * 26));
  assert.equal(monthlyGrossFor("HOURLY", pay), R(80 * 8 * 26));
  assert.deepEqual(DEFAULT_NORMAL_MONTH, { daysAMonth: 26, hoursADay: 8 });
  // The company can set its own normal month.
  assert.equal(monthlyGrossFor("DAILY_WAGE", pay, { daysAMonth: 24, hoursADay: 9 }), R(600 * 24));
  assert.equal(monthlyGrossFor("HOURLY", pay, { daysAMonth: 24, hoursADay: 9 }), R(80 * 9 * 24));
  // Half an hour a day still works out exactly.
  assert.equal(monthlyGrossFor("HOURLY", pay, { daysAMonth: 26, hoursADay: 7.5 }), R(80 * 7.5 * 26));
});

test("a daily-wage person gets a cost to company like anyone else", () => {
  const comps = [
    { code: "BASIC", name: "Basic", percentBps: 5000, pfWage: true, esiWage: true },
    { code: "HRA", name: "HRA", percentBps: 2000, pfWage: false, esiWage: true },
    { code: "SPECIAL", name: "Special allowance", percentBps: null, pfWage: false, esiWage: true },
  ];
  const gross = monthlyGrossFor("DAILY_WAGE", { monthlySalary: 0n, dailyWage: R(600), hourlyRate: 0n });
  const c = ctcFromGross({ monthlyGross: gross, components: comps, settings: DEFAULT_SETTINGS, options: DEFAULT_CTC_OPTIONS, month: "2026-11" });
  assert.equal(c.monthlyGross, R(15600));
  assert.equal(c.annual.ctc, R(15600 * 12));
});
