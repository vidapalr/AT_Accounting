import test from "node:test";
import assert from "node:assert/strict";
import { explainWhatsAppError, maskPhone } from "../src/lib/bot/wa-errors.ts";

test("undeliverable code is explained in plain words", () => {
  assert.match(explainWhatsAppError(131026), /not on WhatsApp/);
  assert.equal(explainWhatsAppError(999999), "");
  assert.equal(explainWhatsAppError(null), "");
});
test("only the last four digits of a number are shown", () => {
  assert.equal(maskPhone("919876543210"), "ending 3210");
  assert.equal(maskPhone("12"), "an unknown number");
});
