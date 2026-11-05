import test from "node:test";
import assert from "node:assert/strict";
import { cleanNotes, notesValue, expectedNotes } from "../src/lib/cash-notes.ts";

test("cleanNotes keeps only clean counts", () => {
  assert.deepEqual(cleanNotes('{"500":2,"7":3,"100":-1,"50":"x"}'), { "500": 2 });
  assert.deepEqual(cleanNotes("garbage"), {});
});
test("notesValue adds up", () => assert.equal(notesValue({ "500": 2, "100": 3 }), 1300));
test("expectedNotes: opening plus received minus change", () => {
  const e = expectedNotes({ "500": 2, "100": 5 }, [
    { received: { "500": 1 }, change: { "100": 2 } },
    { received: { "100": 1 }, change: {} },
  ]);
  assert.equal(e["500"], 3);
  assert.equal(e["100"], 4);
  assert.equal(e["10"], 0);
});
