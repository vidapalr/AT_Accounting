import test from "node:test";
import assert from "node:assert/strict";
import { optWord, roomLeft, estimatePaise, rupeesToPaise, firstName, isBlockingCode, eventKey, whatsappDigits } from "../src/lib/broadcast-math.ts";

test("STOP and START words", () => {
  assert.equal(optWord(" STOP "), "STOP");
  assert.equal(optWord("Stop."), "STOP");
  assert.equal(optWord("unsubscribe"), "STOP");
  assert.equal(optWord("start"), "START");
  assert.equal(optWord("please stop sending"), null);
  assert.equal(optWord(null), null);
});
test("room left today", () => {
  assert.equal(roomLeft(200, 150), 50);
  assert.equal(roomLeft(200, 250), 0);
  assert.equal(roomLeft(0, 0), 0);
});
test("cost estimate and rate parsing", () => {
  assert.equal(rupeesToPaise("0.88"), 88);
  assert.equal(rupeesToPaise("1"), 100);
  assert.equal(rupeesToPaise(""), null);
  assert.equal(rupeesToPaise("abc"), null);
  assert.equal(estimatePaise(100, 88), 8800);
  assert.equal(estimatePaise(100, null), null);
});
test("first name", () => {
  assert.equal(firstName("Priya Sharma"), "Priya");
  assert.equal(firstName("Walk-in"), "there");
  assert.equal(firstName(""), "there");
  assert.equal(firstName("9876543210"), "there");
});
test("blocking codes, event key, digits", () => {
  assert.equal(isBlockingCode(190), true);
  assert.equal(isBlockingCode(131026), false);
  assert.equal(isBlockingCode(undefined), false);
  assert.equal(eventKey([3, 1, 3, 2]), "1-2-3");
  assert.equal(whatsappDigits("9876543210"), "919876543210");
  assert.equal(whatsappDigits("1234567890"), null);
});
