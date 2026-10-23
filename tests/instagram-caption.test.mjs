import test from "node:test";
import assert from "node:assert/strict";
import { buildCaption, toHashtag } from "../src/lib/instagram-caption.ts";

test("hashtags are letters and digits only", () => {
  assert.equal(toHashtag("Cotton Saree!"), "#CottonSaree");
  assert.equal(toHashtag("  "), null);
});

test("caption has the details and hashtags", () => {
  const c = buildCaption({ name: "Silk Saree", fabric: "Silk", colors: ["Red", "Red", "Blue"] });
  assert.match(c, /New at Abhiram Textiles/);
  assert.match(c, /Colours: Red, Blue/);
  assert.match(c, /#SilkSaree/);
  assert.ok(c.length <= 2200);
});
