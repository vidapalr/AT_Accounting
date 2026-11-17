import test from "node:test";
import assert from "node:assert/strict";
import { NAVIGATION, menuFor, parseModulesOff, activeHref } from "../src/lib/navigation.ts";

test("every menu address appears once, under one header", () => {
  const hrefs = NAVIGATION.flatMap((s) => s.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const s of NAVIGATION) assert.ok(s.items.length > 0 && s.module, s.id);
});

test("switched-off modules disappear; core ones cannot be switched off", () => {
  const off = parseModulesOff("investors, hr, accounting, nonsense");
  assert.deepEqual([...off].sort(), ["hr", "investors"]);
  const menu = menuFor(() => true, off);
  assert.ok(!menu.some((s) => s.module === "investors" || s.module === "hr"));
  assert.ok(menu.some((s) => s.module === "accounting"));
});

test("a role sees only what it may open, and empty headers are hidden", () => {
  const menu = menuFor((href) => href === "/accounting/sales" || href === "/accounting/invoices");
  assert.deepEqual(menu.map((s) => s.id), ["sell"]);
  assert.equal(activeHref("/accounting/sales/12", menu), "/accounting/sales");
});
