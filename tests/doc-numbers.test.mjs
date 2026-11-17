import test from "node:test";
import assert from "node:assert/strict";
import { twoLetters, cleanCode } from "../src/lib/doc-numbers.ts";

test("letters for numbers come from names, never a fixed company", () => {
  assert.equal(twoLetters("Beta Retail"), "BE");
  assert.equal(twoLetters("x"), "XX");
  assert.equal(twoLetters("12 Main"), "MA");
});

test("a saved code is cleaned to 2-4 capital letters", () => {
  assert.equal(cleanCode("ab"), "AB");
  assert.equal(cleanCode("a-b-c-d-e"), "ABCD");
  assert.equal(cleanCode("1"), null);
});
