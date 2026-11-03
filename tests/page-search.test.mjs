import test from "node:test";
import assert from "node:assert/strict";
import { searchPages } from "../src/lib/page-search.ts";
const pages = [
  { label: "Salaries", href: "/a", hint: "Pay your staff", group: "People" },
  { label: "Staff advances", href: "/b", group: "People" },
  { label: "Invoices", href: "/c", hint: "All bills; staff discount", group: "Sell" },
];
test("search", () => {
  assert.deepEqual(searchPages(pages, ""), []);
  assert.equal(searchPages(pages, "sal")[0].href, "/a");
  assert.equal(searchPages(pages, "staff")[0].href, "/b"); // name match first
  assert.equal(searchPages(pages, "staff").length, 3);
  assert.equal(searchPages(pages, "sell bill")[0].href, "/c");
  assert.equal(searchPages(pages, "zzz").length, 0);
});
