import test from "node:test";
import assert from "node:assert/strict";
import { parseOrderLines, orderTotalPaise } from "../src/lib/po-math.ts";

test("parses rows, skips blanks and prices lines to the paisa", () => {
  const lines = parseOrderLines([
    { variant: "1", quantity: "10", cost: "650.50" },
    { variant: "", quantity: "", cost: "" },
    { variant: "2", quantity: "2.5", cost: "100" },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].lineAmount, "6505.00");
  assert.equal(lines[1].unitCost, "100.0000");
  assert.equal(orderTotalPaise(lines), 675500n);
});
test("rejects bad numbers, zero, repeats and empty orders", () => {
  assert.equal(parseOrderLines([{ variant: "1", quantity: "0", cost: "5" }]), null);
  assert.equal(parseOrderLines([{ variant: "1", quantity: "1", cost: "abc" }]), null);
  assert.equal(parseOrderLines([{ variant: "1", quantity: "1", cost: "5" }, { variant: "1", quantity: "2", cost: "5" }]), null);
  assert.equal(parseOrderLines([{ variant: "", quantity: "", cost: "" }]), null);
});
