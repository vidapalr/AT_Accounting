import test from "node:test";
import assert from "node:assert/strict";
import { checkSignUp, safeNext, tooManyTries } from "../src/lib/shop-account-math.ts";

const good = { name: "Asha Rao", email: " Asha@Example.COM ", phone: "+1 415 555 0100", password: "longenough1" };

test("a good sign-up is cleaned", () => {
  const r = checkSignUp(good);
  assert.equal(r.ok, true);
  assert.equal(r.value.email, "asha@example.com");
});

test("weak or wrong details are refused with a readable message", () => {
  assert.equal(checkSignUp({ ...good, name: "" }).ok, false);
  assert.equal(checkSignUp({ ...good, email: "nope" }).ok, false);
  assert.equal(checkSignUp({ ...good, phone: "abc" }).ok, false);
  assert.equal(checkSignUp({ ...good, password: "short" }).ok, false);
  assert.equal(checkSignUp({ ...good, password: "x".repeat(73) }).ok, false);
});

test("login can only send the customer to a page inside the shop", () => {
  assert.equal(safeNext("/shop/checkout"), "/shop/checkout");
  assert.equal(safeNext("https://evil.example"), "/shop/account");
  assert.equal(safeNext("//evil.example"), "/shop/account");
  assert.equal(safeNext("/accounting/sales"), "/shop/account");
  assert.equal(safeNext(undefined), "/shop/account");
});

test("repeated login tries are slowed down", () => {
  const hits = new Map();
  for (let i = 0; i < 8; i++) assert.equal(tooManyTries(hits, "a", 1000 + i), false);
  assert.equal(tooManyTries(hits, "a", 2000), true);
  assert.equal(tooManyTries(hits, "a", 1000 + 16 * 60_000), false);
});
