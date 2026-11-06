import test from "node:test";
import assert from "node:assert/strict";
import { pickWelcomeProducts, photoCaption, welcomePhotoCount } from "../src/lib/bot/welcome.ts";

test("photo count: default 5, clamped 0 to 8", () => {
  assert.equal(welcomePhotoCount(undefined), 5);
  assert.equal(welcomePhotoCount(""), 5);
  assert.equal(welcomePhotoCount("3"), 3);
  assert.equal(welcomePhotoCount("0"), 0);
  assert.equal(welcomePhotoCount("99"), 8);
  assert.equal(welcomePhotoCount("-2"), 0);
});
test("newest first, only in stock with price and photo", () => {
  const items = [
    { id: 1, name: "A", fromPrice: 100, available: true, coverId: 11 },
    { id: 4, name: "D", fromPrice: 400, available: true, coverId: 14 },
    { id: 3, name: "C", fromPrice: null, available: true, coverId: 13 },
    { id: 5, name: "E", fromPrice: 500, available: false, coverId: 15 },
    { id: 6, name: "F", fromPrice: 600, available: true, coverId: null },
    { id: 2, name: "B", fromPrice: 200, available: true, coverId: 12 },
  ];
  assert.deepEqual(pickWelcomeProducts(items, 2).map((p) => p.id), [4, 2]);
  assert.equal(pickWelcomeProducts(items, 0).length, 0);
});
test("caption has name, price and link", () => {
  assert.equal(photoCaption("Saree", 1250, "https://x/shop/3"), "Saree\nFrom ₹1,250\nhttps://x/shop/3");
});
