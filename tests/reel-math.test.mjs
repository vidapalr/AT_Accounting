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

test("whole photo stays inside its area at every zoom; fill covers the screen", async () => {
  const { photoBox, REEL_MAX_ZOOM } = await import("../src/lib/reel-math.ts");
  const area = { x: 20, y: 40, w: 680, h: 920 }, screen = { w: 720, h: 1280 };
  for (const [iw, ih] of [[3000, 4000], [4000, 3000], [1000, 1000], [600, 2400]]) {
    for (const z of [1, 1.04, REEL_MAX_ZOOM, 1.5]) {
      const b = photoBox(iw, ih, area, screen, z, "whole");
      assert.ok(b.x >= area.x - 0.001 && b.y >= area.y - 0.001, `inside left/top ${iw}x${ih} z${z}`);
      assert.ok(b.x + b.w <= area.x + area.w + 0.001 && b.y + b.h <= area.y + area.h + 0.001, `inside right/bottom ${iw}x${ih} z${z}`);
      assert.ok(Math.abs(b.w / b.h - iw / ih) < 0.001, "shape kept");
    }
  }
  const f = photoBox(3000, 4000, area, screen, 1, "fill");
  assert.ok(f.w >= 720 && f.h >= 1280);
});
