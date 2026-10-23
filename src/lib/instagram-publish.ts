/**
 * Posts one photo or video to the Instagram business account through Meta's Graph API.
 * Needs server settings INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN (never put the
 * token in chat or in code). The photo/video must be reachable from the internet, so
 * the product must be switched on for the online shop and the site must be live.
 * `fetchFn` can be replaced in tests.
 */

const API = "https://graph.facebook.com/v21.0";

export type PublishInput = {
  kind: "IMAGE" | "VIDEO";
  url: string;
  caption: string;
  userId: string;
  token: string;
  pollMs?: number;
  maxPolls?: number;
};

export class InstagramError extends Error {}

type FetchFn = typeof fetch;

async function call(fetchFn: FetchFn, path: string, init: { method: "GET" | "POST"; params: Record<string, string> }) {
  const url = new URL(`${API}${path}`);
  let body: URLSearchParams | undefined;
  if (init.method === "GET") {
    for (const [k, v] of Object.entries(init.params)) url.searchParams.set(k, v);
  } else {
    body = new URLSearchParams(init.params);
  }
  const res = await fetchFn(url, { method: init.method, body });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string }; [k: string]: unknown };
  if (!res.ok || json.error) {
    throw new InstagramError(String(json.error?.message ?? `Instagram answered ${res.status}`).slice(0, 250));
  }
  return json;
}

export async function publishToInstagram(input: PublishInput, fetchFn: FetchFn = fetch): Promise<{ instagramMediaId: string }> {
  const caption = input.caption.slice(0, 2200);
  const params: Record<string, string> = { caption, access_token: input.token };
  if (input.kind === "VIDEO") {
    params.media_type = "REELS";
    params.video_url = input.url;
  } else {
    params.image_url = input.url;
  }

  const container = await call(fetchFn, `/${input.userId}/media`, { method: "POST", params });
  const containerId = String(container.id ?? "");
  if (!containerId) throw new InstagramError("Instagram did not accept the file.");

  // Videos take a while; photos are usually ready at once.
  const maxPolls = input.maxPolls ?? (input.kind === "VIDEO" ? 24 : 6);
  const pollMs = input.pollMs ?? 5000;
  for (let i = 0; i < maxPolls; i++) {
    const status = await call(fetchFn, `/${containerId}`, {
      method: "GET",
      params: { fields: "status_code", access_token: input.token },
    });
    const code = String(status.status_code ?? "");
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") throw new InstagramError("Instagram could not process this file.");
    if (i === maxPolls - 1) throw new InstagramError("Instagram is still processing. Try again in a minute.");
    await new Promise(r => setTimeout(r, pollMs));
  }

  const published = await call(fetchFn, `/${input.userId}/media_publish`, {
    method: "POST",
    params: { creation_id: containerId, access_token: input.token },
  });
  return { instagramMediaId: String(published.id ?? "") };
}
