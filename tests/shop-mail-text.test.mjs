import test from "node:test";
import assert from "node:assert/strict";
import { orderMail, ownerAlert, resetEmail } from "../src/lib/shop-mail-text.ts";

const o = { orderNo: "WEB-00007", name: "Asha", items: 998, shipping: 2500, country: "United States" };

test("reset email carries the link and says it is one-time", () => {
  const m = resetEmail("Asha", "https://textiles.abhiraminc.com/shop/account/reset?token=abc");
  assert.match(m.text, /token=abc/);
  assert.match(m.text, /1 hour/);
});

test("each order status has its own subject and the right totals", () => {
  assert.match(orderMail("REQUESTED", o).subject, /received/);
  const c = orderMail("CONFIRMED", o);
  assert.match(c.text, /₹3,498\.00/);
  assert.match(c.text, /Shipping to United States: ₹2,500\.00/);
  assert.match(orderMail("COMPLETED", o).subject, /on its way/);
  assert.match(orderMail("CANCELLED", { ...o, note: "Out of stock" }).text, /Out of stock/);
});

test("owner alert names the order and customer", () => {
  const a = ownerAlert({ orderNo: "WEB-00007", name: "Asha", country: "India", items: 499, lines: 1 });
  assert.match(a.subject, /WEB-00007/);
  assert.match(a.text, /Asha/);
});
