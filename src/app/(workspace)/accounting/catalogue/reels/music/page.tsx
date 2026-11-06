import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { removeTrackAction } from "@/lib/reel-actions";

type Props = { searchParams: Promise<{ saved?: string; removed?: string; error?: string }> };

const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 16 };
const input: React.CSSProperties = { padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, width: "100%", fontSize: 16, boxSizing: "border-box" };
const ERRORS: Record<string, string> = {
  missing: "Choose a song file and give it a name.",
  licence: "Tick the box to confirm the song is free to use.",
  type: "That file is not a song the app can use. Use MP3, M4A, OGG or WAV.",
  size: "That file is too big (over 15 MB).",
  save: "Could not save the song. Please try again.",
};

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const q = await searchParams;
  let tracks: RowDataPacket[] = [];
  let ready = true;
  try {
    [tracks] = await db.execute<RowDataPacket[]>(
      `SELECT id, track_name, size_bytes, DATE_FORMAT(created_at, '%d %b %Y') AS added FROM acct_reel_tracks
        WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY track_name`, [user.legal_business_id]);
  } catch { ready = false; }

  return (
    <div style={{ maxWidth: 760 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/catalogue">← Catalogue</Link></nav>
      <h1>Music for reels</h1>
      <p style={{ color: "#475569" }}>
        Add songs that are free to use in videos (for example from the YouTube Audio Library or Pixabay Music). Songs from films or the radio can get your
        Instagram or Facebook account in trouble. Staff then pick one when making a reel.
      </p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>Song added.</p>}
      {q.removed && <p role="status" style={{ color: "#166534" }}>Song removed.</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{ERRORS[q.error] ?? "Something went wrong."}</p>}
      {!ready && <p role="alert" style={{ color: "#b91c1c" }}>Music needs the database file 073_reel_tracks.sql to be run first.</p>}
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Add a song</h2>
        <form action="/api/catalogue/reels/music" method="post" encType="multipart/form-data" style={{ display: "grid", gap: 12 }}>
          <label>Name (so staff know it)<br /><input name="name" required maxLength={120} style={input} placeholder="Soft festive" /></label>
          <label>Song file (MP3, M4A, OGG or WAV, up to 15 MB)<br /><input type="file" name="file" accept="audio/*" required style={input} /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="licence" value="1" style={{ width: 22, height: 22 }} /> This song is free to use in our videos
          </label>
          <div><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "12px 20px" }}>Add the song</button></div>
        </form>
      </section>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Songs ({tracks.length})</h2>
        {tracks.length === 0 && <p style={{ margin: 0 }}>No songs yet.</p>}
        {tracks.map(t => (
          <div key={String(t.id)} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid #f1f5f9" }}>
            <strong style={{ minWidth: 140 }}>{String(t.track_name)}</strong>
            <audio controls preload="none" src={`/api/catalogue/reels/music/${t.id}`} style={{ maxWidth: 260 }} />
            <span style={{ color: "#64748b" }}>{(Number(t.size_bytes) / 1024 / 1024).toFixed(1)} MB, added {String(t.added)}</span>
            <form action={removeTrackAction}><input type="hidden" name="id" value={String(t.id)} /><button type="submit" className="btn-link" style={{ cursor: "pointer", fontSize: 15, padding: "10px 16px" }}>Remove</button></form>
          </div>
        ))}
      </section>
    </div>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
