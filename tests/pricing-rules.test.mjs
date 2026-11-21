import { test } from "node:test";
import assert from "node:assert/strict";
import { priceBand, cost4ToPaise } from "../src/lib/pricing-rules.ts";

test("price band from cost, the typed price always inside it", () => {
  assert.equal(cost4ToPaise("210.0000"), 21000n);
  assert.equal(cost4ToPaise("650.5050"), 65051n);
  // cost 210: min 210 x 1.01 x 1.3 = 275.73, max 210 x 1.01 x 2 = 424.20
  assert.deepEqual(priceBand(21000n, 35000n), { min: 27573n, max: 42420n, usual: 35000n });
  // Selling below the usual minimum (like SA_123 at 200): the minimum comes down to the price typed
  assert.deepEqual(priceBand(21000n, 20000n), { min: 20000n, max: 42420n, usual: 20000n });
  assert.deepEqual(priceBand(21000n, 50000n), { min: 27573n, max: 50000n, usual: 50000n });
});
