import test from "node:test";
import assert from "node:assert/strict";
import { clampSeconds, reelDuration, frameAt, volumeAt } from "../src/lib/reel-math.ts";

test("seconds per photo stays between 2 and 5", () => {
  assert.equal(clampSeconds(1), 2);
  assert.equal(clampSeconds(9), 5);
  assert.equal(clampSeconds(3), 3);
  assert.equal(clampSeconds(NaN), 3);
});
test("duration is photos times seconds", () => assert.equal(reelDuration(4, 3), 12));
test("frames: first photo, then fade into the next, last photo never fades", () => {
  assert.deepEqual(frameAt(0, 3, 3), { index: 0, next: null, mix: 0, zoom: 1 });
  const f = frameAt(2.75, 3, 3);
  assert.equal(f.index, 0); assert.equal(f.next, 1); assert.ok(f.mix > 0.49 && f.mix < 0.51);
  assert.equal(frameAt(3.1, 3, 3).index, 1);
  const last = frameAt(8.9, 3, 3);
  assert.equal(last.index, 2); assert.equal(last.next, null);
  assert.equal(frameAt(100, 3, 3).index, 2);
});
test("volume fades out over the last second", () => {
  assert.equal(volumeAt(0, 10), 1);
  assert.equal(volumeAt(8.9, 10), 1);
  assert.ok(Math.abs(volumeAt(9.5, 10) - 0.5) < 1e-9);
  assert.equal(volumeAt(10, 10), 0);
});
