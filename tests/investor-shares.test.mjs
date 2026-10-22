import test from "node:test";
import assert from "node:assert/strict";
import {
  allocate, buildSegments, checkCapacity, parseBasis, parseUnits, resolveIntervals, FULL_SHARE, SHARE_SCALE,
} from "../src/lib/investor-shares/engine.ts";

const v = (o) => ({
  agreementId: 1, agreementNo: "A1", partyName: "X", versionNo: 1,
  divisionId: null, branchId: null, basis: "NET", basisText: "Net", basisRecognised: true,
  units: 10 * SHARE_SCALE, from: "2026-10-01", to: null, lossCarryForward: true, ...o,
});

test("basis text is understood", () => {
  assert.equal(parseBasis("Distributable Net Profit").basis, "NET");
  assert.equal(parseBasis("Gross profit").basis, "GROSS");
  assert.equal(parseBasis("Operating").basis, "OPERATING");
  assert.equal(parseBasis("").recognised, false);
});

test("percent parsing", () => {
  assert.equal(parseUnits("50"), 500000);
  assert.equal(parseUnits("12.5"), 125000);
  assert.throws(() => parseUnits("101"));
});

test("a newer version closes the older one the day before", () => {
  const iv = resolveIntervals([
    v({ versionNo: 1, from: "2026-10-01", branchId: 1, divisionId: 1 }),
    v({ versionNo: 2, from: "2026-10-17", divisionId: 1 }),
  ]);
  assert.equal(iv[0].end, "2026-10-16");
  assert.equal(iv[1].end, null);
});

test("period is split at the change date and each part uses its own ledger profit", () => {
  const versions = [
    v({ versionNo: 1, from: "2026-10-01", branchId: 1, divisionId: 1, units: 50 * SHARE_SCALE }),
    v({ versionNo: 2, from: "2026-10-17", divisionId: 1, units: 50 * SHARE_SCALE }),
  ];
  const segs = buildSegments(versions, "2026-10-01", "2026-10-31");
  assert.equal(segs.length, 2);
  const lookup = (place, from, to) => {
    // branch earned 1,000.00 in the first part; division earned 4,000.00 in the second
    const net = place.branchId === 1 && to === "2026-10-16" ? 100000n : place.branchId === null && from === "2026-10-17" ? 400000n : 0n;
    return { gross: net, operating: net, net };
  };
  const { rows, totals } = allocate(segs, lookup);
  assert.equal(rows[0].share, 50000n);
  assert.equal(rows[1].share, 200000n);
  assert.equal(totals[0].payable, 250000n);
});

test("loss carry-forward: a loss in one part reduces the next, never below zero", () => {
  const versions = [
    v({ versionNo: 1, from: "2026-10-01", units: 50 * SHARE_SCALE }),
    v({ versionNo: 2, from: "2026-10-11", units: 50 * SHARE_SCALE }),
  ];
  const segs = buildSegments(versions, "2026-10-01", "2026-10-31");
  const lookup = (p, from) => {
    const n = from === "2026-10-01" ? -100000n : 150000n;
    return { gross: n, operating: n, net: n };
  };
  assert.equal(allocate(segs, lookup).totals[0].payable, 25000n); // -500 + 750
  const noCarry = segs.map((s) => ({ ...s, lossCarryForward: false }));
  assert.equal(allocate(noCarry, lookup).totals[0].payable, 75000n);
  const allLoss = allocate(segs, () => ({ gross: -100n, operating: -100n, net: -100n }));
  assert.equal(allLoss.totals[0].payable, 0n);
});

test("rounding never loses a paisa across the split", () => {
  const segs = buildSegments([v({ units: 33 * SHARE_SCALE })], "2026-10-01", "2026-10-31");
  const { rows } = allocate(segs, () => ({ gross: 1001n, operating: 1001n, net: 1001n }));
  assert.equal(rows[0].share, 330n);
});

test("group + division + branch on the same basis may not pass 100%", () => {
  const issues = checkCapacity([
    v({ agreementId: 1, units: 40 * SHARE_SCALE }),
    v({ agreementId: 2, divisionId: 1, units: 40 * SHARE_SCALE }),
    v({ agreementId: 3, divisionId: 1, branchId: 5, units: 30 * SHARE_SCALE }),
  ]);
  assert.ok(issues.some((i) => i.kind === "OVER_100"));
});

test("different profit bases have separate 100% caps", () => {
  const issues = checkCapacity([
    v({ agreementId: 1, divisionId: 1, units: 60 * SHARE_SCALE, basis: "GROSS" }),
    v({ agreementId: 2, divisionId: 1, units: 60 * SHARE_SCALE, basis: "NET" }),
  ]);
  assert.equal(issues.length, 0);
});

test("group agreements stay within 49% across every basis", () => {
  const ok = checkCapacity([
    v({ agreementId: 1, units: 30 * SHARE_SCALE, basis: "GROSS" }),
    v({ agreementId: 2, units: 19 * SHARE_SCALE, basis: "NET" }),
  ]);
  assert.equal(ok.length, 0);
  const bad = checkCapacity([
    v({ agreementId: 1, units: 30 * SHARE_SCALE, basis: "GROSS" }),
    v({ agreementId: 2, units: 20 * SHARE_SCALE, basis: "NET" }),
  ]);
  assert.ok(bad.some((i) => i.kind === "GROUP_LIMIT"));
});

test("division and branch agreements have no owner minimum", () => {
  assert.equal(
    checkCapacity([v({ divisionId: 1, units: FULL_SHARE })]).length,
    0
  );
});

test("a change date is checked: old version ends the day before so there is no overlap", () => {
  const issues = checkCapacity([
    v({ versionNo: 1, divisionId: 1, units: 60 * SHARE_SCALE, from: "2026-10-01" }),
    v({ versionNo: 2, divisionId: 1, units: 60 * SHARE_SCALE, from: "2026-10-17" }),
  ]);
  assert.equal(issues.length, 0);
});
