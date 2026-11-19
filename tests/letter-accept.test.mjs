import { test } from "node:test";
import assert from "node:assert/strict";

import { acceptPayload, parseAcceptance, acceptanceRecord } from "../src/lib/letter-accept.ts";

test("the I accept button carries the send id", () => {
  assert.equal(acceptPayload(42), "LACCEPT:42");
  assert.deepEqual(parseAcceptance("LACCEPT:42", "I accept"), { sendId: 42, words: "I accept" });
  assert.deepEqual(parseAcceptance("LACCEPT:7", null), { sendId: 7, words: "I accept" });
});

test("typed acceptance words count; anything else does not", () => {
  for (const w of ["I accept", "i accept.", "ACCEPT", "Accepted", "Yes, I accept", "I agree"]) assert.ok(parseAcceptance(null, w), w);
  for (const w of ["IN", "OUT", "accept later", "I don't accept", "hello", "", null]) assert.equal(parseAcceptance(null, w), null, String(w));
  assert.equal(parseAcceptance("SOMETHING:1", "hi"), null);
});

test("acceptance record lists what was sent and how it was accepted", () => {
  const rows = acceptanceRecord({ employer: "Acme", person: "Asha", employeeCode: "EMP-0007", letter: "Letter of appointment", sentAt: "19-11-2026 20:10",
    sentTo: "+917672078554", acceptedAt: "19-11-2026 20:12", acceptedFrom: "+917672078554", words: "I accept", messageId: "wamid.X", sha256: "ab".repeat(32) });
  assert.deepEqual(rows[1], ["Employee", "Asha (EMP-0007)"]);
  assert.equal(rows.at(-1)[1].length, 64);
});
