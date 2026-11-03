import test from "node:test";
import assert from "node:assert/strict";
import { base32Encode, base32Decode, codeForStep, checkCode, newSecret, newBackupCodes, normaliseBackupCode, otpAuthUrl } from "../src/lib/totp.ts";

// RFC 6238 test secret "12345678901234567890" (SHA1). At T=59s the 8-digit code is 94287082, so the 6-digit is 287082.
const RFC = base32Encode(Buffer.from("12345678901234567890"));
test("RFC 6238 vectors", () => {
  assert.equal(codeForStep(RFC, Math.floor(59 / 30)), "287082");
  assert.equal(codeForStep(RFC, Math.floor(1111111109 / 30)), "081804");
  assert.equal(codeForStep(RFC, Math.floor(2000000000 / 30)), "279037");
});
test("base32 round trip", () => {
  const b = Buffer.from("hello world!");
  assert.equal(base32Decode(base32Encode(b)).toString(), "hello world!");
  assert.equal(newSecret().length, 32);
});
test("checkCode: right code, drift window, replay, junk", () => {
  const now = 1111111109 * 1000;
  const step = Math.floor(1111111109 / 30);
  assert.equal(checkCode(RFC, "081804", now), step);
  assert.equal(checkCode(RFC, "081 804", now), step);
  assert.equal(checkCode(RFC, codeForStep(RFC, step - 1), now), step - 1); // 30 s late
  assert.equal(checkCode(RFC, codeForStep(RFC, step - 2), now), null); // too old
  assert.equal(checkCode(RFC, "081804", now, step), null); // already used
  assert.equal(checkCode(RFC, "12345", now), null);
  assert.equal(checkCode(RFC, "abcdef", now), null);
});
test("backup codes and url", () => {
  const codes = newBackupCodes();
  assert.equal(codes.length, 8);
  assert.ok(codes.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c)));
  assert.equal(new Set(codes).size, 8);
  assert.equal(normaliseBackupCode("k7qd-4m2x9p"), "K7QD4M2X9P");
  assert.ok(otpAuthUrl("ABC", "a@b.com").startsWith("otpauth://totp/Abhiram%20Group:a%40b.com?secret=ABC"));
});
