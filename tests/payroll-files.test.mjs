import test from "node:test";
import assert from "node:assert/strict";
import { pfEcr, esiSheet, salaryTdsDetails, ptRegister } from "../src/lib/payroll/files.ts";

const R = (n) => BigInt(Math.round(n * 100));
const row = { employeeName: "Asha K", nameAsPerUan: null, uan: "100123456789", esiNumber: "3112345678", pan: "ABCDE1234F", month: "2026-10",
  daysInMonth: 31, paidDays: 29, gross: R(18710), pfWages: R(9355), epsWages: R(9355), edliWages: R(9355), esiWages: R(18710),
  empPf: R(1123), erEps: R(779), erEpf: R(344), empEsi: R(141), erEsi: R(609), pt: R(150), tds: 0n, paidOn: "2026-11-01" };

test("PF ECR line: 11 fields, #~#, whole rupees, NCP days", () => {
  const f = pfEcr([row, { ...row, employeeName: "No Uan", uan: null }]);
  assert.equal(f.content, "100123456789#~#ASHA K#~#18710#~#9355#~#9355#~#9355#~#1123#~#779#~#344#~#2#~#0\n");
  assert.deepEqual(f.skipped, ["No Uan: no 12-digit UAN"]);
});

test("ESI sheet has the portal columns and skips people without an IP number", () => {
  const f = esiSheet([row, { ...row, employeeName: "B", esiNumber: "" }]);
  assert.match(f.content, /^IP Number,IP Name/);
  assert.match(f.content, /3112345678,Asha K,29,18710,,/);
  assert.equal(f.skipped.length, 1);
});

test("TDS details flag a missing PAN; PT register lists only people with PT", () => {
  const f = salaryTdsDetails([{ ...row, tds: R(500), pan: null }], "392");
  assert.match(f.content, /PANNOTAVBL,Asha K,392,2026-10,2026-11-01,18710.00,500.00/);
  assert.equal(f.skipped.length, 1);
  assert.match(ptRegister([row, { ...row, pt: 0n, employeeName: "Z" }]).content, /^Employee,Month,Gross salary,Professional tax\nAsha K,2026-10,18710.00,150.00\n$/);
});
