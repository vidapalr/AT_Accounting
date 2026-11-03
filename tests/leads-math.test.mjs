import test from "node:test";
import assert from "node:assert/strict";
import { cleanSource, isDue } from "../src/lib/leads-math.ts";
test("leads", () => {
  assert.equal(cleanSource("INSTAGRAM"), "INSTAGRAM");
  assert.equal(cleanSource("junk"), "OTHER");
  assert.equal(isDue("NEW", "2026-11-03", "2026-11-03"), true);
  assert.equal(isDue("FOLLOW_UP", "2026-11-05", "2026-11-03"), false);
  assert.equal(isDue("WON", "2026-11-01", "2026-11-03"), false);
  assert.equal(isDue("NEW", null, "2026-11-03"), false);
});
