import test from "node:test";
import assert from "node:assert/strict";
import { denominationTotal, parseDenominations } from "../src/lib/cash-denominations.ts";

test("notes and coins add up exactly in paise", () => {
  assert.equal(denominationTotal({ "500": 3, "100": 2, "10": 5 }, 7500n), 150000n + 20000n + 5000n + 7500n);
  assert.equal(denominationTotal({}), 0n);
});

test("bad counts are refused", () => {
  assert.throws(() => denominationTotal({ "500": -1 }));
  assert.throws(() => denominationTotal({ "500": 1.5 }));
  assert.throws(() => parseDenominations('{"notes":{"100":"x"}}'));
});

test("empty form value means no note counting was used", () => {
  assert.equal(parseDenominations(""), null);
  const p = parseDenominations('{"notes":{"500":2,"20":0},"coins":1500}');
  assert.deepEqual(p.notes, { "500": 2 });
  assert.equal(p.coins, 1500n);
});

import { drawerVsBooks } from "../src/lib/cash-math.ts";
test("drawer against books takes cash sent to the bank off the books figure", () => {
  const r = drawerVsBooks({ books: 1000000n, takenAway: 400000n, counted: 600000n });
  assert.equal(r.booksAfterTaken, 600000n);
  assert.equal(r.difference, 0n);
  assert.equal(drawerVsBooks({ books: 100n, takenAway: 0n, counted: 90n }).difference, -10n);
});
