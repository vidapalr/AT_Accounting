import test from "node:test";
import assert from "node:assert/strict";
import { parseStockMessage } from "../src/lib/stock-message.ts";

test("each kind of message is understood", () => {
  const out = parseStockMessage(
    "RECEIVED ATX_CS_BS_SS_01 10\ndamaged ATX_CS_BS_01 2 torn at edge\nlost abc 1\nCOUNT 2000000000244 14\nSOLD ATX_1 1 at 1500"
  );
  assert.equal(out.length, 5);
  assert.deepEqual([out[0].action, out[0].item, out[0].quantity], ["RECEIVED", "ATX_CS_BS_SS_01", 10]);
  assert.equal(out[1].note, "torn at edge");
  assert.equal(out[2].action, "LOST");
  assert.equal(out[3].quantity, 14);
  assert.equal(out[4].price, 1500);
  assert.ok(out.every(l => l.problem === null));
});

test("friendly spellings and separators", () => {
  const out = parseStockMessage("got ABC x 5; sold ABC 2 @1200\nSOLD ABC 1 ₹999");
  assert.equal(out[0].action, "RECEIVED");
  assert.equal(out[0].quantity, 5);
  assert.equal(out[1].price, 1200);
  assert.equal(out[2].price, 999);
});

test("bad lines say what is wrong", () => {
  const out = parseStockMessage("hello there\nRECEIVED\nRECEIVED ABC\nRECEIVED ABC ten\nRECEIVED ABC 0\nRECEIVED ABC -2");
  assert.equal(out.length, 6);
  assert.ok(out.every(l => l.problem));
});

test("a count of zero is allowed", () => {
  assert.equal(parseStockMessage("COUNT ABC 0")[0].problem, null);
});
