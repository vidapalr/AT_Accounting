import test from "node:test";
import assert from "node:assert/strict";
import { publishToInstagram } from "../src/lib/instagram-publish.ts";

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? String(init.body) : "" });
    const r = responses.shift();
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json };
  };
  return { fn, calls };
}

test("photo: container, ready check, publish", async () => {
  const { fn, calls } = fakeFetch([{ json: { id: "C1" } }, { json: { status_code: "FINISHED" } }, { json: { id: "M9" } }]);
  const out = await publishToInstagram({ kind: "IMAGE", url: "https://x.test/a.jpg", caption: "Hi", userId: "42", token: "T" }, fn);
  assert.equal(out.instagramMediaId, "M9");
  assert.match(calls[0].url, /\/42\/media$/);
  assert.match(calls[0].body, /image_url=https%3A%2F%2Fx.test%2Fa.jpg/);
  assert.match(calls[2].url, /\/42\/media_publish$/);
  assert.match(calls[2].body, /creation_id=C1/);
});

test("video is sent as a reel and waits until finished", async () => {
  const { fn, calls } = fakeFetch([{ json: { id: "C2" } }, { json: { status_code: "IN_PROGRESS" } }, { json: { status_code: "FINISHED" } }, { json: { id: "M1" } }]);
  await publishToInstagram({ kind: "VIDEO", url: "https://x.test/v.mp4", caption: "c", userId: "42", token: "T", pollMs: 1 }, fn);
  assert.match(calls[0].body, /media_type=REELS/);
  assert.equal(calls.length, 4);
});

test("Meta errors become a readable message", async () => {
  const { fn } = fakeFetch([{ ok: false, status: 400, json: { error: { message: "Invalid token" } } }]);
  await assert.rejects(publishToInstagram({ kind: "IMAGE", url: "u", caption: "c", userId: "1", token: "T" }, fn), /Invalid token/);
});
