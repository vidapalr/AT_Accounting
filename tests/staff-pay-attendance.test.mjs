import test from "node:test";
import assert from "node:assert/strict";
import { ctcFromGross, grossFromCtc, DEFAULT_CTC_OPTIONS, paidDaysFromAttendance } from "../src/lib/payroll/ctc.ts";
import { DEFAULT_SETTINGS } from "../src/lib/payroll/engine.ts";
import { R } from "../src/lib/payroll/rules.ts";
import { parseAttendanceMessage, indiaDateTime, applyPunch, hoursWorked, monthHours, monthMarks, punchReply } from "../src/lib/attendance.ts";
import { pieSlices, OTHER_COLOUR, PIE_COLOURS } from "../src/lib/reports/pie.ts";
import { daysToRenewal, isRegistrationKind } from "../src/lib/registrations.ts";
import { billLinks, brandFrom } from "../src/lib/brand-core.ts";
import { DEFAULT_TERMS, DEFAULT_TEMPLATES, TERMS_FOR } from "../src/lib/staff-letters.ts";
import { buildLetterPack } from "../src/lib/letter-pack.ts";

const comps = [
  { code: "BASIC", name: "Basic", percentBps: 5000, pfWage: true, esiWage: true },
  { code: "HRA", name: "HRA", percentBps: 2000, pfWage: false, esiWage: true },
  { code: "SPECIAL", name: "Special allowance", percentBps: null, pfWage: false, esiWage: true },
];
const on = { ...DEFAULT_SETTINGS, pf: { ...DEFAULT_SETTINGS.pf, enabled: true }, esi: { ...DEFAULT_SETTINGS.esi, enabled: true } };
const base = { components: comps, month: "2026-11", age: 30 };

test("CTC with PF and ESI off is just 12 x gross", () => {
  const c = ctcFromGross({ ...base, monthlyGross: R(15000), settings: DEFAULT_SETTINGS, options: DEFAULT_CTC_OPTIONS });
  assert.equal(c.employerMonthly.total, 0n);
  assert.equal(c.annual.ctc, R(180000));
  assert.equal(c.basic, R(7500));
});

test("CTC adds employer PF and ESI, bonus and gratuity when switched on", () => {
  const plain = ctcFromGross({ ...base, monthlyGross: R(15000), settings: on, options: DEFAULT_CTC_OPTIONS });
  assert.ok(plain.employerMonthly.pf > 0n && plain.employerMonthly.esi > 0n);
  assert.equal(plain.annual.ctc, R(180000) + plain.employerMonthly.total * 12n);
  assert.ok(plain.takeHomeMonthly < R(15000));
  const extra = ctcFromGross({ ...base, monthlyGross: R(15000), settings: on, options: { ...DEFAULT_CTC_OPTIONS, bonus: true, gratuity: true } });
  assert.equal(extra.annual.bonus, R(Math.round(7000 * 0.0833 * 12))); // rounded to the rupee; basic 7,500 capped at 7,000
  assert.equal(extra.annual.gratuity, R(Math.round(7500 * 0.0481 * 12)));
  const high = ctcFromGross({ ...base, monthlyGross: R(30000), settings: on, options: { ...DEFAULT_CTC_OPTIONS, bonus: true } });
  assert.equal(high.annual.bonus, 0n, "no statutory bonus above Rs 21,000 a month");
});

test("gross from CTC fits without going over", () => {
  const target = R(250000);
  const c = grossFromCtc({ ...base, annualCtc: target, settings: on, options: DEFAULT_CTC_OPTIONS });
  assert.ok(c.annual.ctc <= target);
  const next = ctcFromGross({ ...base, monthlyGross: c.monthlyGross + 100n, settings: on, options: DEFAULT_CTC_OPTIONS });
  assert.ok(next.annual.ctc > target);
});

test("paid days by type of work", () => {
  assert.equal(paidDaysFromAttendance("DAILY_WAGE", 30, { present: 20, half: 3, absent: 2 }), 21.5);
  assert.equal(paidDaysFromAttendance("PART_TIME", 30, { present: 20, half: 2, absent: 3 }), 26);
  assert.equal(paidDaysFromAttendance("FULL_TIME", 30, { present: 0, half: 0, absent: 0 }), 30);
  // Paid by the hour: the pay is already the rate times the hours, so the month is not cut by days.
  assert.equal(paidDaysFromAttendance("HOURLY", 30, { present: 12, half: 0, absent: 8 }), 30);
});

test("hours worked in a month add up", () => {
  assert.equal(monthHours([
    { inTime: "09:00:00", outTime: "17:30:00" },
    { inTime: "10:00:00", outTime: "13:00:00" },
    { inTime: "09:00:00", outTime: null },
    { inTime: null, outTime: null },
  ]), 11.5);
  assert.equal(monthHours([]), 0);
});

test("WhatsApp IN / OUT words", () => {
  for (const w of ["IN", "in", "Check in", "IN 🙏", "reached"]) assert.equal(parseAttendanceMessage(w), "IN", w);
  for (const w of ["out", "Leaving", "LOG OUT", "bye!"]) assert.equal(parseAttendanceMessage(w), "OUT", w);
  for (const w of ["", null, "hello", "price of the blue kurti?", "I am in the shop now and will stay late"]) assert.equal(parseAttendanceMessage(w), null);
});

test("India time and punches", () => {
  // 2026-11-18 03:45:10 UTC = 09:15:10 IST
  assert.deepEqual(indiaDateTime(Date.UTC(2026, 10, 18, 3, 45, 10) / 1000), { date: "2026-11-18", time: "09:15:10" });
  // 20:00 UTC = 01:30 next day IST
  assert.equal(indiaDateTime(Date.UTC(2026, 10, 18, 20, 0, 0) / 1000).date, "2026-11-19");
  let d = { inTime: null, outTime: null, status: null };
  d = applyPunch(d, "IN", "09:20:00");
  d = applyPunch(d, "IN", "09:40:00");
  d = applyPunch(d, "OUT", "18:00:00");
  d = applyPunch(d, "OUT", "17:00:00");
  assert.deepEqual(d, { inTime: "09:20:00", outTime: "18:00:00", status: "PRESENT" });
  assert.equal(applyPunch({ inTime: null, outTime: null, status: "HALF_DAY" }, "IN", "13:00:00").status, "HALF_DAY");
  assert.equal(hoursWorked("09:20:00", "18:00:00"), 8.7);
  assert.equal(hoursWorked("18:00:00", "09:00:00"), null);
  assert.deepEqual(monthMarks([{ status: "PRESENT" }, { status: "HALF_DAY" }, { status: "ABSENT" }, { status: "HOLIDAY" }, { status: null }]), { present: 1, half: 1, absent: 1, leave: 0, off: 1 });
  assert.match(punchReply("Asha", "IN", "09:20:00"), /^Good morning Asha\. IN marked at 09:20/);
  assert.match(punchReply("Asha", "IN", "14:05:00"), /^Good afternoon/);
  assert.match(punchReply("Asha", "IN", "19:54:00"), /^Good evening/);
});

test("pie folds small slices into Other", () => {
  const parts = Array.from({ length: 9 }, (_, i) => ({ label: `P${i}`, value: 90 - i * 10 }));
  const s = pieSlices([...parts, { label: "zero", value: 0 }, { label: "neg", value: -5 }]);
  assert.equal(s.length, 6);
  assert.equal(s[5].label, "Other (4)");
  assert.equal(s[5].color, OTHER_COLOUR);
  assert.equal(s[0].color, PIE_COLOURS[0]);
  assert.ok(Math.abs(s.reduce((t, x) => t + x.share, 0) - 1) < 1e-9);
  assert.equal(pieSlices([{ label: "a", value: 0 }]).length, 0);
});

test("registrations helpers", () => {
  assert.equal(daysToRenewal("2026-11-18", "2026-12-18"), 30);
  assert.equal(daysToRenewal("2026-11-18", "2026-11-10"), -8);
  assert.equal(daysToRenewal("2026-11-18", null), null);
  assert.ok(isRegistrationKind("GST"));
  assert.ok(!isRegistrationKind("NOPE"));
});

test("bill QR links keep only https addresses, in order", () => {
  const brand = brandFrom({ legal_name: "Test Co" }, { brand_instagram: "https://instagram.com/test", brand_facebook: "http://facebook.com/x", brand_youtube: "javascript:alert(1)", brand_map_link: "https://maps.app.goo.gl/abc" });
  assert.deepEqual(billLinks(brand).map((l) => l.label), ["Find the shop", "Instagram"]);
});

test("letters for part time, daily wage and hourly staff", () => {
  const ctx = { title: "Ms.", name: "Asha", jobTitle: "Helper", salary: "8,000", joinedOn: "01-11-2026", noticeGivenOn: "", leftOn: "", letterDate: "03-11-2026", place: "Hyderabad", employer: "Test Co", terms: DEFAULT_TERMS };
  const packText = (type, c) => JSON.stringify(buildLetterPack({
    type, ctx: c, dateIso: "2026-11-03", letter: DEFAULT_TEMPLATES[type], terms: DEFAULT_TEMPLATES[TERMS_FOR[type]],
    homeAddress: "", phone: "", workAddress: "", annexure: null,
  }));
  const pt = packText("part_time_appointment", { ...ctx, employmentType: "PART_TIME" });
  assert.match(pt, /8,000/);
  const dw = packText("daily_wage_engagement", { ...ctx, employmentType: "DAILY_WAGE", dailyWage: "500" });
  assert.match(dw, /500/);
  assert.match(dw, /day/i);
  const hr = packText("hourly_engagement", { ...ctx, employmentType: "HOURLY", hourlyRate: "80" });
  assert.match(hr, /80/);
  assert.match(hr, /hour/i);
});
