import test from "node:test";
import assert from "node:assert/strict";
import { mergeTimeline, last10 } from "../src/lib/customer-timeline.ts";
test("timeline order and phone", () => {
  const ev = [
    { at: "2026-11-01", kind: "BILL", title: "a", detail: "" },
    { at: "2026-11-03 10:00:00", kind: "NOTE", title: "b", detail: "" },
    { at: "2026-11-03", kind: "PAYMENT", title: "c", detail: "" },
    { at: "2026-10-30 09:00:00", kind: "CHAT", title: "d", detail: "" },
  ];
  assert.deepEqual(mergeTimeline(ev).map((e) => e.title), ["b", "c", "a", "d"]);
  assert.equal(mergeTimeline(ev, 2).length, 2);
  assert.equal(last10("+91 98765-43210"), "9876543210");
  assert.equal(last10("123"), null);
  assert.equal(last10(null), null);
});
