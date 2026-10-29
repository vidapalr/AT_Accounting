import test from "node:test";
import assert from "node:assert/strict";
import { classify, matchAnswer, matchProducts, productReply, orderReply, orderNoFrom, ownerCommand, last10, TEXT } from "../src/lib/bot/engine.ts";

test("menu numbers, greetings and person requests", () => {
  assert.deepEqual(classify("1", "NONE"), { kind: "MENU", n: 1 });
  assert.deepEqual(classify("3", "NONE"), { kind: "MENU", n: 3 });
  assert.equal(classify("Hello", "NONE").kind, "GREETING");
  assert.equal(classify("good morning", "NONE").kind, "GREETING");
  assert.equal(classify("I want to talk to someone", "NONE").kind, "PERSON");
});

test("order numbers are recognised, bare digits only when asked for an order", () => {
  assert.equal(orderNoFrom("my order web-12 status", false), "WEB-00012");
  assert.equal(orderNoFrom("12", false), null);
  assert.equal(orderNoFrom("12", true), "WEB-00012");
  assert.deepEqual(classify("12", "ORDER"), { kind: "ORDER", orderNo: "WEB-00012" });
});

test("price questions become product searches; other text is left for saved answers", () => {
  assert.deepEqual(classify("price of banarasi saree?", "NONE"), { kind: "PRODUCT", query: "banarasi saree" });
  assert.deepEqual(classify("kanchipuram", "PRODUCT"), { kind: "PRODUCT", query: "kanchipuram" });
  assert.equal(classify("what is your shop address", "NONE").kind, "OTHER");
});

const answers = [
  { id: 1, title: "Timing", keywords: "timing, open, close", reply: "10am to 9pm" },
  { id: 2, title: "Return", keywords: "return policy, exchange", reply: "7 days" },
];
test("saved answers match on keyword phrases, with plurals", () => {
  assert.equal(matchAnswer("what are your timings", answers)?.id, 1);
  assert.equal(matchAnswer("what is the return policy", answers)?.id, 2);
  assert.equal(matchAnswer("do you sell shoes", answers), null);
});

const items = [
  { id: 1, name: "Banarasi Silk Saree", fabric: "Silk", fromPrice: 4500, available: true },
  { id: 2, name: "Cotton Kurti", fabric: "Cotton", fromPrice: 799, available: false },
];
test("products are matched by name, never invented", () => {
  assert.deepEqual(matchProducts("banarasi saree", items).map((i) => i.id), [1]);
  assert.deepEqual(matchProducts("kurtis", items).map((i) => i.id), [2]);
  assert.deepEqual(matchProducts("lehenga", items), []);
  const r = productReply(matchProducts("kurti", items), "https://x.test");
  assert.match(r, /out of stock/);
  assert.match(r, /https:\/\/x\.test\/shop\/2/);
  assert.doesNotMatch(r, /undefined/);
});

test("order replies and owner commands", () => {
  assert.match(orderReply({ orderNo: "WEB-00001", status: "REQUESTED", items: 1000, shipping: 0 }), /shipping to be confirmed/);
  assert.match(orderReply({ orderNo: "WEB-00001", status: "CONFIRMED", items: 1000, shipping: 80 }), /1,080/);
  assert.deepEqual(ownerCommand("sales yesterday"), { kind: "SALES", day: "yesterday" });
  assert.deepEqual(ownerCommand("stock red silk"), { kind: "STOCK", query: "red silk" });
  assert.equal(ownerCommand("who owes me").kind, "OWES");
  assert.equal(ownerCommand("blah").kind, "HELP");
  assert.equal(last10("+91 98765-43210"), "9876543210");
  assert.match(TEXT.handoff, /shop hours/);
});
