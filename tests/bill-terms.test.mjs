import test from "node:test";
import assert from "node:assert/strict";
import { termsLines, cleanTerms, DEFAULT_TERMS, MAX_TERMS } from "../src/lib/bill-terms-text.ts";
test("terms", () => {
  assert.deepEqual(termsLines(DEFAULT_TERMS).length, 2);
  assert.deepEqual(termsLines("1. No return\n\n  2) One offer \n"), ["No return", "One offer"]);
  assert.equal(termsLines(null).length, 0);
  assert.equal(termsLines(Array.from({ length: 30 }, (_, i) => `t${i}`).join("\n")).length, MAX_TERMS);
  assert.equal(cleanTerms("a\n\n b "), "a\nb");
});
