import test from "node:test";
import assert from "node:assert/strict";
import { stateFromGstin, validHsn, parseRate, splitTax } from "../src/lib/gst.ts";

test("state is read from the first two digits of a GSTIN", () => {
  assert.equal(stateFromGstin("36ABCDE1234F1Z5")?.name, "Telangana");
  assert.equal(stateFromGstin("not-a-gstin"), null);
});

test("hsn and rate checks", () => {
  assert.ok(validHsn("") && validHsn("5208") && validHsn("52081190"));
  assert.ok(!validHsn("52") && !validHsn("52a8"));
  assert.deepEqual(parseRate("5"), { ok: true, rate: "5" });
  assert.deepEqual(parseRate(""), { ok: true, rate: null });
  assert.equal(parseRate("abc").ok, false);
  assert.equal(parseRate("120").ok, false);
});

test("tax splits into CGST and SGST in the same state, else IGST, with no paisa lost", () => {
  assert.deepEqual(splitTax(101n, true), { cgst: 50n, sgst: 51n, igst: 0n });
  assert.deepEqual(splitTax(101n, false), { cgst: 0n, sgst: 0n, igst: 101n });
});
