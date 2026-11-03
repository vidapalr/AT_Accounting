"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchPages, type SearchPage } from "@/lib/page-search";

export default function HeaderSearch({ pages }: { pages: SearchPage[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const found = searchPages(pages, q);

  function go(p: SearchPage | undefined) {
    if (!p) return;
    setQ(""); setOpen(false);
    router.push(p.href);
  }

  return (
    <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
      <input
        type="search"
        value={q}
        placeholder="Search pages… (e.g. salary, bill)"
        aria-label="Search pages"
        onChange={(e) => { setQ(e.target.value); setPick(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setPick((i) => Math.min(i + 1, found.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setPick((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); go(found[pick]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        style={{ width: "100%", padding: "10px 12px", fontSize: 15, borderRadius: 8, border: "1px solid #cbd5e1" }}
      />
      {open && q.trim() && (
        <ul role="listbox" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, margin: "4px 0 0", padding: 4, listStyle: "none", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, boxShadow: "0 8px 24px #0f172a22" }}>
          {found.length === 0 && <li style={{ padding: 10, color: "#64748b" }}>No page found</li>}
          {found.map((p, i) => (
            <li key={p.href} role="option" aria-selected={i === pick}
              onMouseDown={(e) => { e.preventDefault(); go(p); }}
              style={{ padding: "10px 12px", cursor: "pointer", borderRadius: 6, background: i === pick ? "#eef2ff" : "transparent" }}>
              <strong style={{ display: "block" }}>{p.label}</strong>
              <small style={{ color: "#64748b" }}>{p.group}{p.hint ? ` · ${p.hint}` : ""}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
