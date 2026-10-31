import test from "node:test";
import assert from "node:assert/strict";
import { publishCarouselToInstagram } from "../src/lib/instagram-publish.ts";
import { publishToFacebook } from "../src/lib/facebook-publish.ts";

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body ? String(init.body) : "" });
    const r = responses.shift();
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.json };
  };
  return { fn, calls };
}

test("Instagram: several photos become one carousel post", async () => {
  const { fn, calls } = fakeFetch([
    { json: { id: "A" } }, { json: { id: "B" } },
    { json: { status_code: "FINISHED" } }, { json: { status_code: "FINISHED" } },
    { json: { id: "P" } }, { json: { status_code: "FINISHED" } }, { json: { id: "M7" } },
  ]);
  const out = await publishCarouselToInstagram({ urls: ["https://x.test/1.jpg", "https://x.test/2.jpg"], caption: "Hi", userId: "42", token: "T", pollMs: 1 }, fn);
  assert.equal(out.instagramMediaId, "M7");
  assert.match(calls[0].body, /is_carousel_item=true/);
  assert.match(calls[4].body, /media_type=CAROUSEL/);
  assert.match(calls[4].body, /children=A%2CB/);
  assert.match(calls[6].body, /creation_id=P/);
});

test("Instagram carousel needs 2 to 10 photos", async () => {
  await assert.rejects(() => publishCarouselToInstagram({ urls: ["a"], caption: "x", userId: "1", token: "T" }, async () => ({})));
});

test("Facebook: one photo is posted directly", async () => {
  const { fn, calls } = fakeFetch([{ json: { id: "1", post_id: "9_1" } }]);
  const out = await publishToFacebook({ pageId: "77", token: "T", caption: "Hi", photoUrls: ["https://x.test/1.jpg"] }, fn);
  assert.equal(out.facebookPostId, "9_1");
  assert.match(calls[0].url, /\/77\/photos$/);
  assert.match(calls[0].body, /caption=Hi/);
});

test("Facebook: several photos are uploaded unpublished, then attached to one post", async () => {
  const { fn, calls } = fakeFetch([{ json: { id: "P1" } }, { json: { id: "P2" } }, { json: { id: "POST" } }]);
  const out = await publishToFacebook({ pageId: "77", token: "T", caption: "Hi", photoUrls: ["https://x.test/1.jpg", "https://x.test/2.jpg"] }, fn);
  assert.equal(out.facebookPostId, "POST");
  assert.match(calls[0].body, /published=false/);
  assert.match(calls[2].url, /\/77\/feed$/);
  const body = decodeURIComponent(calls[2].body);
  assert.match(body, /attached_media\[0\]=\{"media_fbid":"P1"\}/);
  assert.match(body, /attached_media\[1\]=\{"media_fbid":"P2"\}/);
});

test("Facebook errors are readable", async () => {
  const { fn } = fakeFetch([{ ok: false, status: 400, json: { error: { message: "Invalid OAuth access token." } } }]);
  await assert.rejects(() => publishToFacebook({ pageId: "77", token: "T", caption: "x", photoUrls: ["u"] }, fn), /Invalid OAuth/);
});
