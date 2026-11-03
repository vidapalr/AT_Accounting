"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { searchPages, type SearchPage } from "@/lib/page-search";
import { searchRecordsAction } from "@/lib/record-search-actions";

type Item = { key: string; title: string; sub: string; href: string; tag: string };

export default function HeaderSearch({ pages }: { pages: SearchPage[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const [records, setRecords] = useState<Item[]>([]);
  const pageHits: Item[] = searchPages(pages, q, 4).map(p => ({ key: `p${p.href}`, title: p.label, sub: `${p.group}${p.hint ? ` · ${p.hint}` : ""}`, href: p.href, tag: "Page" }));
  const found = [...records, ...pageHits];

  // Records (customer, bill, product...) are looked up on the server once typing pauses.
  useEffect(() => {
    if (q.trim().length < 2) { setRecords([]); return; }
    let live = true;
    const t = setTimeout(() => {
      searchRecordsAction(q)
        .then(r => { if (live) setRecords(r.map((h, i) => ({ key: `r${i}${h.href}`, title: h.title, sub: h.detail, href: h.href, tag: h.kind }))); })
        .catch(() => { if (live) setRecords([]); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  function go(p: { href: string } | undefined) {
    if (!p) return;
    setQ(""); setOpen(false);
    router.push(p.href);
  }

  return (
    <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 420 }}>
      <input
        type="search"
        value={q}
        placeholder="Search anything…"
        aria-label="Search"
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
          {found.length === 0 && <li style={{ padding: 10, color: "#64748b" }}>Nothing found</li>}
          {found.map((p, i) => (
            <li key={p.key} role="option" aria-selected={i === pick}
              onMouseDown={(e) => { e.preventDefault(); go(p); }}
              style={{ padding: "10px 12px", cursor: "pointer", borderRadius: 6, background: i === pick ? "#eef2ff" : "transparent" }}>
              <strong style={{ display: "block" }}>{p.title} <small style={{ color: "#4f46e5", fontWeight: 600 }}>{p.tag}</small></strong>
              <small style={{ color: "#64748b" }}>{p.sub}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
