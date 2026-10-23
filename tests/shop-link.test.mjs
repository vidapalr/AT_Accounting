import test from "node:test";
import assert from "node:assert/strict";
import { shopOrderLink } from "../src/lib/shop-link.ts";

test("order link goes to the shop number with the item in the message", () => {
  const url = shopOrderLink("98765 43210", [{ product: "Silk Saree", detail: "Red" }]);
  assert.ok(url.startsWith("https://wa.me/919876543210?text="));
  assert.match(decodeURIComponent(url), /Silk Saree \(Red\)/);
});
