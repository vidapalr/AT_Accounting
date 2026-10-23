import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, prettyPhone } from "../src/lib/customer-phone.ts";

test("different ways of writing a number are the same customer", () => {
  for (const v of ["9876543210", "+91 98765 43210", "098765-43210", "91 9876543210", " 98765 43210 "]) {
    assert.equal(normalizePhone(v), "9876543210", v);
  }
});

test("not a mobile number", () => {
  for (const v of ["", "r2", "12345", "1234567890", "0000000000", null, undefined]) {
    assert.equal(normalizePhone(v), null, String(v));
  }
});

test("pretty format", () => {
  assert.equal(prettyPhone("9876543210"), "98765 43210");
  assert.equal(prettyPhone(null), "");
});
