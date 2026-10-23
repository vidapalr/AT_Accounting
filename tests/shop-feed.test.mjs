import test from "node:test";
import assert from "node:assert/strict";
import { buildFeedCsv, csvCell } from "../src/lib/shop-feed.ts";

test("cells with commas or quotes are quoted", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("plain"), "plain");
});

test("feed has a header and one row per item with price in INR", () => {
  const csv = buildFeedCsv([{
    sku: "ATX_1", productId: 7, title: "Silk Saree, Red", description: "", available: true,
    price: 1500, link: "https://x.test/shop/7", imageUrl: "https://x.test/api/shop/media/3",
    brand: "Abhiram Textiles", size: null, color: "Red",
  }]);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^id,item_group_id,title/);
  assert.match(lines[1], /^ATX_1,P7,"Silk Saree, Red",/);
  assert.match(lines[1], /in stock,new,1500.00 INR,/);
});
