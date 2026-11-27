"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Uploads product photos and videos one file at a time (each request stays small, so big phone photos
 * never hit a size limit), shows progress, then opens the page with the result.
 */
export default function MediaUploader({ productId }: { productId: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function upload() {
    const files = [...(input.current?.files ?? [])].filter((f) => f.size > 0);
    setError("");
    if (files.length === 0) { setError("Choose at least one photo or video first."); return; }
    if (files.length > 12) { setError("Please upload up to 12 files at a time."); return; }
    let saved = 0, skipped = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      const body = new FormData();
      body.append("product_id", String(productId));
      body.append("files", files[i]);
      try {
        const res = await fetch(`/api/catalogue/media?product=${productId}`, { method: "POST", body, headers: { accept: "application/json" } });
        const out = (await res.json().catch(() => null)) as { saved?: number; skipped?: number } | null;
        if (!out) { skipped += 1; continue; }
        saved += out.saved ?? 0;
        skipped += out.skipped ?? 0;
      } catch {
        skipped += 1; // no connection: counted as skipped, the rest still go
      }
    }
    setBusy("");
    if (input.current) input.current.value = "";
    router.replace(`/accounting/catalogue/${productId}?upload=${saved}-${skipped}`);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        disabled={!!busy}
        style={{ padding: 10, border: "1px dashed #94a3b8", borderRadius: 10, background: "#f8fafc" }}
      />
      <button type="button" onClick={upload} disabled={!!busy} className="btn-link btn-link-primary" style={{ cursor: "pointer", justifySelf: "start" }}>
        {busy || "Upload"}
      </button>
      {error && <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{error}</p>}
      <small style={{ color: "#64748b" }}>
        Photos: JPG, PNG or WebP up to 8 MB. Videos: MP4, MOV or WebM up to 60 MB. Up to 12 files at a time.
        The first photo becomes the cover.
      </small>
    </div>
  );
}
