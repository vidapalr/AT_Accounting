/**
 * Posts to the Facebook Page through Meta's Graph API: one photo, several photos in one post, or one video.
 * Needs server settings FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN (a Page token; never put it in chat or code).
 * Photos and videos must be reachable from the internet, like Instagram.
 * `fetchFn` can be replaced in tests.
 */

const API = "https://graph.facebook.com/v21.0";

export class FacebookError extends Error {}
type FetchFn = typeof fetch;

async function post(fetchFn: FetchFn, path: string, params: Record<string, string>) {
  const res = await fetchFn(`${API}${path}`, { method: "POST", body: new URLSearchParams(params) });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; [k: string]: unknown };
  if (!res.ok || json.error) throw new FacebookError(String(json.error?.message ?? `Facebook answered ${res.status}`).slice(0, 250));
  return json;
}

export async function publishToFacebook(
  input: { pageId: string; token: string; caption: string; photoUrls?: string[]; videoUrl?: string },
  fetchFn: FetchFn = fetch
): Promise<{ facebookPostId: string }> {
  const { pageId, token, caption } = input;
  const photos = input.photoUrls ?? [];

  if (input.videoUrl) {
    const v = await post(fetchFn, `/${pageId}/videos`, { file_url: input.videoUrl, description: caption, access_token: token });
    return { facebookPostId: String(v.id ?? "") };
  }
  if (photos.length === 0) throw new FacebookError("No photo to post.");
  if (photos.length === 1) {
    const r = await post(fetchFn, `/${pageId}/photos`, { url: photos[0], caption, access_token: token });
    return { facebookPostId: String(r.post_id ?? r.id ?? "") };
  }
  if (photos.length > 10) throw new FacebookError("At most 10 photos in one post.");

  // Several photos in ONE post: upload each without publishing, then attach them all to a single post.
  const ids: string[] = [];
  for (const url of photos) {
    const r = await post(fetchFn, `/${pageId}/photos`, { url, published: "false", access_token: token });
    const id = String(r.id ?? "");
    if (!id) throw new FacebookError("Facebook did not accept one of the photos.");
    ids.push(id);
  }
  const params: Record<string, string> = { message: caption, access_token: token };
  ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const feed = await post(fetchFn, `/${pageId}/feed`, params);
  return { facebookPostId: String(feed.id ?? "") };
}
