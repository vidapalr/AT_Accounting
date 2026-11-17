import test from "node:test";
import assert from "node:assert/strict";
import { buildLetter, renderLetter, leaveWords, DEFAULT_TERMS, DEFAULT_TEMPLATES } from "../src/lib/staff-letters.ts";
const ctx = { title: "Ms.", name: "Asha", jobTitle: "Sales Girl", salary: "12,000", joinedOn: "01-11-2026", noticeGivenOn: "", leftOn: "", letterDate: "03-11-2026", place: "Hyderabad", employer: "Test Co", terms: DEFAULT_TERMS };
test("leave words", () => {
  assert.equal(leaveWords("12"), "12 paid leaves in a year");
  assert.equal(leaveWords("1"), "1 paid leave in a year");
  assert.equal(leaveWords("0"), "No paid leave is given");
  assert.equal(leaveWords(""), "No paid leave is given");
});
test("appointment carries the typed terms", () => {
  const l = buildLetter("appointment", ctx);
  const text = JSON.stringify(l);
  assert.ok(text.includes("₹12,000") && text.includes("10:00 AM to 9:00 PM") && text.includes("30 days"));
  assert.ok(text.includes("Ms. Asha") && text.includes("01-11-2026"));
});
test("missing dates show a fill-in blank, not 'null'", () => {
  const l = buildLetter("experience", { ...ctx, joinedOn: "" });
  const text = JSON.stringify(l);
  assert.ok(text.includes("[joining date]") && text.includes("[last working day]") && !text.includes("null"));
});
test("no leave and no probation", () => {
  const text = JSON.stringify(buildLetter("offer", { ...ctx, terms: { ...DEFAULT_TERMS, leaves: "0", probationDays: "0" } }));
  assert.ok(text.includes("No paid leave is given") && text.includes("Probation: None"));
});

test("letters name the employer from the brand, never a fixed company", () => {
  const text = JSON.stringify(buildLetter("offer", ctx));
  assert.ok(text.includes("at Test Co, Hyderabad"));
});
test("a company's own wording fills its blanks and lists", () => {
  const l = renderLetter({ heading: "NOTE FOR {{name}}", body: "Hello {{person}}.\n\n- one {{salary}}\n- two\n\nBye {{new_salary}}", needsAcceptance: false }, ctx);
  assert.equal(l.heading, "NOTE FOR Asha");
  assert.deepEqual(l.blocks, [
    { kind: "p", text: "Hello Ms. Asha." },
    { kind: "list", items: ["one ₹12,000", "two"] },
    { kind: "p", text: "Bye [new salary]" },
  ]);
});
test("every standard letter renders without leftover blanks", () => {
  for (const [type, t] of Object.entries(DEFAULT_TEMPLATES)) {
    const text = JSON.stringify(renderLetter(t, { ...ctx, newSalary: "15,000", effectiveFrom: "01-12-2026", reason: "late", leftOn: "30-11-2026", noticeGivenOn: "01-11-2026" }));
    assert.ok(!/\{\{/.test(text), type);
  }
});
