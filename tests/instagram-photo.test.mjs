import { test } from "node:test";
import assert from "node:assert/strict";
import { igCanvas } from "../src/lib/instagram-photo-math.ts";

test("Instagram canvas: shrink wide photos, add bars to very tall or very wide ones", () => {
  assert.deepEqual(igCanvas(1080, 1080), { width: 1080, height: 1080, scaledWidth: 1080, scaledHeight: 1080 });
  // A phone photo (3:4) is taller than 4:5: shrunk to 1440 wide, white bars left and right.
  const tall = igCanvas(3000, 4000);
  assert.equal(tall.scaledWidth, 1440); assert.equal(tall.scaledHeight, 1920); assert.equal(tall.width, 1536); assert.equal(tall.height, 1920);
  const wide = igCanvas(1000, 300);
  assert.equal(wide.width, 1000); assert.equal(wide.height, 524);
});
