import test from "node:test";
import assert from "node:assert/strict";
import { pickAutoPostable } from "../src/lib/ledger/auto-post.ts";

const d = (t, id) => ({ sourceType: t, sourceId: id, entryDate: "2026-10-01", description: "x", lines: [] });

test("only never-posted, problem-free records are auto-posted", () => {
  const drafts = [d("SALE", 1), d("SALE", 2), d("EXPENSE", 3), d("OPENING_BALANCE", 4)];
  const got = pickAutoPostable(drafts, ["EXPENSE 3 (rent): account 6010 cannot be posted to"], new Set(["SALE#2"]));
  assert.deepEqual(got.map((x) => `${x.sourceType}#${x.sourceId}`), ["SALE#1"]);
});
