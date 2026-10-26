import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { proxy } from "../src/proxy.ts";

const call = (host, path) => proxy(new NextRequest(`http://${host}${path}`, { headers: { host } }));

test("shop address shows only the shop", () => {
  assert.equal(call("textiles.abhiraminc.com", "/shop/12").headers.get("location"), null);
  assert.equal(call("textiles.abhiraminc.com", "/api/shop/media/3").headers.get("location"), null);
  assert.match(call("textiles.abhiraminc.com", "/").headers.get("location"), /\/shop$/);
  assert.equal(call("textiles.abhiraminc.com", "/login").headers.get("location"), "https://accounting.abhiraminc.com/login");
  assert.equal(call("textiles.abhiraminc.com", "/accounting/sales").status, 308);
});

test("old shop links on the accounting address move to the shop address", () => {
  assert.equal(call("accounting.abhiraminc.com", "/shop/5?x=1").headers.get("location"), "https://textiles.abhiraminc.com/shop/5?x=1");
  assert.equal(call("accounting.abhiraminc.com", "/login").headers.get("location"), null);
});

test("local development is untouched", () => {
  assert.equal(call("localhost:3000", "/shop").headers.get("location"), null);
  assert.equal(call("localhost:3000", "/login").headers.get("location"), null);
});
