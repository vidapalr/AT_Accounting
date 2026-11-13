import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

test("no leftover merge-conflict markers in docs", () => {
  const bad = [];
  for (const f of readdirSync("docs").filter((n) => n.endsWith(".md"))) {
    readFileSync(`docs/${f}`, "utf8").split("\n").forEach((line, i) => {
      if (/^(<<<<<<< |=======$|>>>>>>> )/.test(line)) bad.push(`docs/${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
