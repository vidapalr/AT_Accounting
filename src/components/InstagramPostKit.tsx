"use client";

import { useState, useTransition } from "react";
import { postToSocialAction } from "@/lib/social-actions";

type Media = { id: number; type: "IMAGE" | "VIDEO" };

/**
 * Caption + photo/video, ready for Instagram. Free: nothing is posted automatically.
 * On a phone, "Share to Instagram" opens the share sheet with the file; the caption is
 * copied first so it can be pasted. On a computer, save the file and post from the app.
 */
export default function InstagramPostKit({
  caption: initial,
  media,
  autoPost = false,
  facebookPost = false,
  lastPosted = null,
}: {
  caption: string;
  media: Media[];
  autoPost?: boolean;
  facebookPost?: boolean;
  lastPosted?: string | null;
}) {
  const [pending, startPost] = useTransition();
  // Ticked to post: the photos (up to 10, one combined post) and the newest video, which goes out as a reel.
  const isVideo = (id: number) => media.find(m => m.id === id)?.type === "VIDEO";
  const [picked, setPicked] = useState<number[]>(() => {
    const photos = media.filter(m => m.type === "IMAGE").slice(0, 10).map(m => m.id);
    const newestVideo = media.filter(m => m.type === "VIDEO").map(m => m.id).sort((a, b) => b - a)[0];
    return newestVideo ? [...photos, newestVideo] : photos;
  });
  const [toInstagram, setToInstagram] = useState(autoPost);
  const [toFacebook, setToFacebook] = useState(facebookPost);
  const [lines, setLines] = useState<string[]>([]);
  const togglePick = (id: number) => setPicked(cur => {
    if (cur.includes(id)) return cur.filter(x => x !== id);
    if (isVideo(id)) return [...cur.filter(x => !isVideo(x)), id]; // one reel at a time
    return cur.filter(x => !isVideo(x)).length >= 10 ? cur : [...cur, id];
  });
  const pickedPhotos = picked.filter(id => !isVideo(id)).length;
  const pickedReel = picked.some(isVideo);
  const pickedWords = [pickedPhotos ? `${pickedPhotos} photo${pickedPhotos === 1 ? "" : "s"}` : "", pickedReel ? "1 reel" : ""].filter(Boolean).join(" and ");
  const [caption, setCaption] = useState(initial);
  const [note, setNote] = useState("");

  async function copy(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(caption);
      return true;
    } catch {
      window.prompt("Copy this caption:", caption);
      return false;
    }
  }

  async function share(m: Media) {
    const copied = await copy();
    try {
      const res = await fetch(`/api/catalogue/media/${m.id}`);
      const blob = await res.blob();
      const file = new File([blob], `photo-${m.id}.${blob.type.split("/")[1] || "jpg"}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setNote(copied ? "Choose Instagram, then paste the caption." : "Choose Instagram.");
        return;
      }
    } catch {
      /* fall through to the manual way */
    }
    setNote("Use “Save to phone”, then open Instagram and paste the caption.");
  }

  const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 };
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>1. Caption</h2>
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          rows={10}
          style={{ width: "100%", padding: 12, fontSize: 16, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box" }}
        />
        <button type="button" className="btn-link btn-link-primary" style={{ cursor: "pointer", marginTop: 8 }}
          onClick={async () => setNote((await copy()) ? "Caption copied." : "")}>
          Copy caption
        </button>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>2. Photo or video</h2>
        {media.length === 0 && <p>No photo or video yet. Add one from “Photos and videos”.</p>}
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {media.map(m => (
            <div key={m.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ aspectRatio: "1 / 1", background: "#f1f5f9" }}>
                {m.type === "VIDEO" ? (
                  <video src={`/api/catalogue/media/${m.id}`} controls preload="metadata" playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/catalogue/media/${m.id}`} alt="Product" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn-link btn-link-primary" style={{ cursor: "pointer" }} onClick={() => share(m)}>
                  Share to Instagram
                </button>
                <a className="btn-link" href={`/api/catalogue/media/${m.id}?download=1`}>Save to phone</a>
                {(autoPost || facebookPost) && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 16 }}>
                    <input type="checkbox" checked={picked.includes(m.id)} onChange={() => togglePick(m.id)} style={{ width: 22, height: 22 }} />
                    {m.type === "VIDEO" ? "Post as a reel" : "Include in the post"}
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
        {(autoPost || facebookPost) && (
          <div style={{ marginTop: 16, padding: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <strong>Post automatically</strong>
            <p style={{ margin: "6px 0", color: "#475569" }}>
              {pickedWords || "Nothing"} selected. Photos go out together as <strong>one post</strong> (swipe-through, up to 10). A ticked video goes out as a <strong>reel</strong>, as its own post.
            </p>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "8px 0" }}>
              {autoPost && (
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={toInstagram} onChange={e => setToInstagram(e.target.checked)} style={{ width: 22, height: 22 }} /> Instagram
                </label>
              )}
              {facebookPost && (
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={toFacebook} onChange={e => setToFacebook(e.target.checked)} style={{ width: 22, height: 22 }} /> Facebook page
                </label>
              )}
            </div>
            <button
              type="button"
              className="btn-link btn-link-primary"
              disabled={pending || picked.length === 0 || (!toInstagram && !toFacebook)}
              style={{ cursor: "pointer", fontSize: 17, padding: "12px 22px" }}
              onClick={() => {
                const where = [toInstagram ? "Instagram" : "", toFacebook ? "Facebook" : ""].filter(Boolean).join(" and ");
                if (!window.confirm(`Post ${pickedWords} to ${where} now?`)) return;
                setLines([]);
                startPost(async () => {
                  const r = await postToSocialAction({ mediaIds: picked, caption, instagram: toInstagram, facebook: toFacebook });
                  setLines(r.messages);
                });
              }}
            >
              {pending ? "Posting… this can take a minute" : `Post ${pickedWords || "now"}${pickedWords ? " now" : ""}`}
            </button>
            {lines.map((l, i) => <p key={i} role="status" style={{ margin: "8px 0 0", color: l.includes("not posted") || l.includes("not set up") ? "#b91c1c" : "#166534" }}>{l}</p>)}
          </div>
        )}
        {lastPosted && <p style={{ color: "#64748b" }}>Last posted: {lastPosted}.</p>}
        {note && <p style={{ background: "#eff6ff", padding: 10, borderRadius: 8 }}>{note}</p>}
        <p style={{ color: "#64748b" }}>
          {autoPost || facebookPost ? "Or share one photo by hand with the buttons above. " : "Instagram needs you to tap Post yourself. "}
          <a href="https://www.instagram.com/" target="_blank" rel="noreferrer">Open Instagram</a>
        </p>
      </section>
    </div>
  );
}
