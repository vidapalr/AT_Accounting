/**
 * Posts to the Facebook Page through Meta's Graph API: one photo, several photos in one post, or one video (as a Reel).
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
): Promise<{ facebookPostId: string; asReel?: boolean }> {
  const { pageId, token, caption } = input;
  const photos = input.photoUrls ?? [];

  if (input.videoUrl) {
    // A video goes out as a Reel; if Facebook will not take it as a Reel (for example not upright 9:16,
    // or longer than 90 seconds), it is posted as a normal video instead.
    try {
      const r = await publishReelToFacebook({ pageId, token, caption, videoUrl: input.videoUrl }, fetchFn);
      return { facebookPostId: r.facebookPostId, asReel: true };
    } catch {
      const v = await post(fetchFn, `/${pageId}/videos`, { file_url: input.videoUrl, description: caption, access_token: token });
      return { facebookPostId: String(v.id ?? ""), asReel: false };
    }
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

/** A Facebook Reel in three steps: start, let Facebook fetch the video from its address, publish. */
export async function publishReelToFacebook(
  input: { pageId: string; token: string; caption: string; videoUrl: string },
  fetchFn: FetchFn = fetch
): Promise<{ facebookPostId: string }> {
  const { pageId, token } = input;
  const start = await post(fetchFn, `/${pageId}/video_reels`, { upload_phase: "start", access_token: token });
  const videoId = String(start.video_id ?? "");
  if (!videoId) throw new FacebookError("Facebook did not start the reel.");
  const res = await fetchFn(`https://rupload.facebook.com/video-upload/v21.0/${videoId}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: input.videoUrl },
  });
  const up = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || !up.success) throw new FacebookError(String(up.error?.message ?? `Facebook did not take the reel video (${res.status}).`).slice(0, 250));
  await post(fetchFn, `/${pageId}/video_reels`, {
    upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description: input.caption.slice(0, 2200), access_token: token,
  });
  return { facebookPostId: videoId };
}
