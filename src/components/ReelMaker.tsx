"use client";

import { useEffect, useRef, useState } from "react";
import { REEL_MAX_PHOTOS, clampSeconds, frameAt, reelDuration, volumeAt } from "@/lib/reel-math";

type Photo = { id: number };
type Track = { id: number; name: string };

const W = 720;
const H = 1280;
const btn: React.CSSProperties = { cursor: "pointer", fontSize: 17, padding: "14px 22px", minHeight: 48 };

/** A vertical reel from product photos: slow zoom, cross-fades, name and price on top, optional music. Made in this browser. */
export default function ReelMaker({
  productId, productName, priceText, photos, tracks,
}: { productId: number; productName: string; priceText: string; photos: Photo[]; tracks: Track[] }) {
  const [picked, setPicked] = useState<number[]>(() => photos.slice(0, REEL_MAX_PHOTOS).map(p => p.id));
  const [seconds, setSeconds] = useState(3);
  const [track, setTrack] = useState<string>("");
  const [title, setTitle] = useState(productName);
  const [price, setPrice] = useState(priceText);
  const [state, setState] = useState<"idle" | "making" | "ready" | "saving">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [video, setVideo] = useState<{ url: string; blob: Blob; mp4: boolean } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  function toggle(id: number) {
    setPicked(cur => cur.includes(id) ? cur.filter(x => x !== id) : cur.length >= REEL_MAX_PHOTOS ? cur : [...cur, id]);
  }

  async function make() {
    setError("");
    if (picked.length === 0) { setError("Tick at least one photo."); return; }
    if (typeof MediaRecorder === "undefined") { setError("This browser cannot make videos. Please use Chrome or Safari, updated."); return; }
    const secs = clampSeconds(seconds);
    const total = reelDuration(picked.length, secs);
    setState("making"); setProgress(0);
    let audioCtx: AudioContext | null = null;
    try {
      const imgs = await Promise.all(picked.map(id => new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error("A photo could not be loaded."));
        im.src = `/api/catalogue/media/${id}`;
      })));
      const canvas = canvasRef.current!;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      const stream = canvas.captureStream(30);

      let gain: GainNode | null = null;
      let source: AudioBufferSourceNode | null = null;
      if (track) {
        const res = await fetch(`/api/catalogue/reels/music/${track}`);
        if (!res.ok) throw new Error("The music could not be loaded.");
        audioCtx = new AudioContext();
        const buf = await audioCtx.decodeAudioData(await res.arrayBuffer());
        const dest = audioCtx.createMediaStreamDestination();
        gain = audioCtx.createGain();
        source = audioCtx.createBufferSource();
        source.buffer = buf; source.loop = true;
        source.connect(gain); gain.connect(dest);
        dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      }

      // Only H.264 + AAC counts: a plain "video/mp4" can hold VP9, which Instagram rejects.
      const mp4Type = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,opus", "video/mp4;codecs=avc1"].find(t => MediaRecorder.isTypeSupported(t));
      const webmType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
      const mimeType = mp4Type ?? webmType;
      const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 3_500_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      const finished = new Promise<void>(resolve => { rec.onstop = () => resolve(); });

      const drawPhoto = (im: HTMLImageElement, zoom: number, alpha: number) => {
        const scale = Math.max(W / im.width, H / im.height) * zoom;
        const w = im.width * scale, h = im.height * scale;
        ctx.globalAlpha = alpha;
        ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
        ctx.globalAlpha = 1;
      };
      const drawText = () => {
        const g = ctx.createLinearGradient(0, H - 380, 0, H);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.65)");
        ctx.fillStyle = g; ctx.fillRect(0, H - 380, W, 380);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        ctx.font = "bold 54px Arial, sans-serif";
        wrap(ctx, title, W / 2, H - 230, W - 100, 62);
        if (price) { ctx.font = "bold 46px Arial, sans-serif"; ctx.fillText(price, W / 2, H - 120); }
        ctx.font = "32px Arial, sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText("Abhiram Textiles", W / 2, H - 55);
      };

      rec.start(250);
      source?.start();
      const t0 = performance.now();
      await new Promise<void>(resolve => {
        const tick = () => {
          const t = (performance.now() - t0) / 1000;
          if (t >= total) { resolve(); return; }
          const f = frameAt(t, picked.length, secs);
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
          drawPhoto(imgs[f.index], f.zoom, 1);
          if (f.next !== null) drawPhoto(imgs[f.next], 1, f.mix);
          drawText();
          if (gain && audioCtx) gain.gain.setValueAtTime(volumeAt(t, total), audioCtx.currentTime);
          setProgress(Math.round((t / total) * 100));
          requestAnimationFrame(tick);
        };
        tick();
      });
      source?.stop();
      rec.stop();
      await finished;
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: mimeType?.split(";")[0] ?? "video/webm" });
      setVideo({ url: URL.createObjectURL(blob), blob, mp4: Boolean(mp4Type) });
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not make the reel.");
      setState("idle");
    } finally {
      void audioCtx?.close().catch(() => {});
    }
  }

  async function save() {
    if (!video) return;
    if (!video.mp4) { setError("This browser made a WebM video, which Instagram does not take. Use Chrome or Safari (updated) to make an MP4 reel, or download this one."); return; }
    setState("saving"); setError("");
    const fd = new FormData();
    fd.set("product_id", String(productId));
    fd.set("file", new File([video.blob], "reel.mp4", { type: "video/mp4" }));
    try {
      const res = await fetch("/api/catalogue/reels", { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; next?: string };
      if (!res.ok || !j.ok || !j.next) throw new Error(j.error ?? "Could not save the reel.");
      window.location.href = j.next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the reel.");
      setState("ready");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {photos.length === 0 ? <p>This product has no photos yet. Add photos first.</p> : (
        <>
          <section>
            <h2 style={{ margin: "0 0 8px" }}>1. Photos (up to {REEL_MAX_PHOTOS}, shown in the order you tick them)</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {photos.map(p => {
                const n = picked.indexOf(p.id);
                return (
                  <button type="button" key={p.id} onClick={() => toggle(p.id)} aria-pressed={n >= 0}
                    style={{ position: "relative", padding: 0, border: n >= 0 ? "3px solid #2f6fed" : "3px solid #e2e8f0", borderRadius: 8, width: 96, height: 128, cursor: "pointer", background: "#fff", overflow: "hidden" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/catalogue/media/${p.id}`} alt="Product photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {n >= 0 && <span style={{ position: "absolute", top: 4, left: 4, background: "#2f6fed", color: "#fff", borderRadius: 12, padding: "2px 8px", fontWeight: 700 }}>{n + 1}</span>}
                  </button>
                );
              })}
            </div>
          </section>
          <section style={{ display: "grid", gap: 10, maxWidth: 460 }}>
            <h2 style={{ margin: 0 }}>2. Words and music</h2>
            <label>Name on the video<br /><input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} style={{ padding: 12, fontSize: 16, width: "100%" }} /></label>
            <label>Price on the video (leave empty for none)<br /><input value={price} onChange={e => setPrice(e.target.value)} maxLength={40} style={{ padding: 12, fontSize: 16, width: "100%" }} placeholder="From ₹499" /></label>
            <label>Seconds for each photo (2 to 5)<br /><input type="number" min={2} max={5} step={1} value={seconds} onChange={e => setSeconds(Number(e.target.value))} style={{ padding: 12, fontSize: 16, width: 120 }} /></label>
            <label>Music<br />
              <select value={track} onChange={e => setTrack(e.target.value)} style={{ padding: 12, fontSize: 16, width: "100%" }}>
                <option value="">No music (add Instagram music when you post)</option>
                {tracks.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
              </select>
            </label>
            {tracks.length === 0 && <p style={{ margin: 0, color: "#64748b" }}>No songs yet. Add licence-free songs on the music page.</p>}
          </section>
          <section>
            <button type="button" className="btn-link btn-link-primary" style={btn} disabled={state === "making" || state === "saving"} onClick={make}>
              {state === "making" ? `Making the reel… ${progress}%` : video ? "Make it again" : "3. Make the reel"}
            </button>
            <p style={{ color: "#64748b", margin: "8px 0 0" }}>It takes as long as the video lasts ({reelDuration(picked.length, seconds)} seconds). Keep this page open and on screen.</p>
          </section>
        </>
      )}
      <canvas ref={canvasRef} width={W} height={H} style={{ display: state === "making" ? "block" : "none", width: 270, height: 480, background: "#000", borderRadius: 8 }} />
      {error && <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
      {video && state !== "making" && (
        <section style={{ display: "grid", gap: 10, justifyItems: "start" }}>
          <h2 style={{ margin: 0 }}>Your reel</h2>
          <video src={video.url} controls playsInline style={{ width: 270, height: 480, background: "#000", borderRadius: 8 }} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn-link btn-link-primary" style={btn} disabled={state === "saving"} onClick={save}>
              {state === "saving" ? "Saving…" : "Save and go to posting"}
            </button>
            <a className="btn-link" style={btn} href={video.url} download={`reel.${video.mp4 ? "mp4" : "webm"}`}>Download</a>
          </div>
          <p style={{ color: "#64748b", margin: 0 }}>Posting opens next: it saves the reel on this product, and the Instagram and Facebook page lists it (the product must be switched on for the shop).</p>
        </section>
      )}
    </div>
  );
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(-2);
  const startY = y - (shown.length - 1) * lineHeight;
  shown.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}
