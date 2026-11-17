import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
process.env.SHOP_HOSTS = "shop.example.com,shop.other.in";
process.env.APP_HOSTS = "app.example.com,app.other.in";
const { proxy } = await import("../src/proxy.ts");

const call = (host, path) => proxy(new NextRequest(`http://${host}${path}`, { headers: { host } }));

test("shop address shows only the shop", () => {
  assert.equal(call("shop.example.com", "/shop/12").headers.get("location"), null);
  assert.equal(call("shop.example.com", "/api/shop/media/3").headers.get("location"), null);
  assert.match(call("shop.example.com", "/").headers.get("location"), /\/shop$/);
  assert.equal(call("shop.example.com", "/login").headers.get("location"), "https://app.example.com/login");
  assert.equal(call("shop.example.com", "/accounting/sales").status, 308);
});

test("old shop links on the accounting address move to the shop address", () => {
  assert.equal(call("app.example.com", "/shop/5?x=1").headers.get("location"), "https://shop.example.com/shop/5?x=1");
  assert.equal(call("app.example.com", "/login").headers.get("location"), null);
});

test("local development is untouched", () => {
  assert.equal(call("localhost:3000", "/shop").headers.get("location"), null);
  assert.equal(call("localhost:3000", "/login").headers.get("location"), null);
});

test("a second company's addresses pair with each other", () => {
  assert.equal(call("shop.other.in", "/login").headers.get("location"), "https://app.other.in/login");
  assert.equal(call("app.other.in", "/shop").headers.get("location"), "https://shop.other.in/shop");
});
