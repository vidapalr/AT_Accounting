import test from "node:test";
import assert from "node:assert/strict";
import { neighbour, stageTotals, winRate, isStage } from "../src/lib/deals-math.ts";
test("deals", () => {
  assert.equal(neighbour("ENQUIRY", 1), "QUOTED");
  assert.equal(neighbour("ENQUIRY", -1), null);
  assert.equal(neighbour("NEGOTIATING", 1), null);
  assert.equal(neighbour("WON", 1), null);
  const t = stageTotals([{ stage: "QUOTED", valuePaise: 500n }, { stage: "QUOTED", valuePaise: 250n }, { stage: "x", valuePaise: 9n }]);
  assert.equal(t.QUOTED.count, 2); assert.equal(t.QUOTED.valuePaise, 750n); assert.equal(t.WON.count, 0);
  assert.equal(winRate(0, 0), null); assert.equal(winRate(1, 3), 25);
  assert.equal(isStage("LOST"), true); assert.equal(isStage("nope"), false);
});
