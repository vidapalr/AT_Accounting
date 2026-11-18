import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const financialReaders = [
  "src/app/(workspace)/accounting/reports/page.tsx",
  "src/app/(workspace)/dashboard/page.tsx",
  "src/components/LedgerStatusNote.tsx",
];

test("opening financial dashboards and reports cannot automatically post journals", () => {
  for (const file of financialReaders) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\bautoPostPending\s*\(/, `${file} must not post while rendering`);
    assert.doesNotMatch(source, /\bpostPendingEntriesAction\s*\(/, `${file} must not invoke an action while rendering`);
  }
});
