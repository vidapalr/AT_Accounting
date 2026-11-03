"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A search box for a list page. Type any part of a name, number, phone or amount; rows that do not match are
 * hidden at once. It searches the rows already on the page (for older records use the search box in the top bar).
 */
export default function TableSearch({ placeholder = "Search this list…", includeInputs = false }: { placeholder?: string; includeInputs?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [count, setCount] = useState<{ shown: number; total: number } | null>(null);

  useEffect(() => {
    const root = (box.current?.closest("main") ?? document.body) as HTMLElement;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const apply = () => {
      let shown = 0, total = 0;
      root.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach(tr => {
        if (tr.querySelector("td[colspan]")) return; // "nothing here" rows
        // Tables where you type quantities or choose items are forms, not lists: leave them alone.
        if (!includeInputs && tr.closest("table")?.querySelector("tbody input:not([type=hidden]):not([type=checkbox]), tbody select, tbody textarea")) return;
        total++;
        const text = (tr.textContent ?? "").toLowerCase();
        const ok = words.every(w => text.includes(w));
        tr.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      setCount(words.length ? { shown, total } : null);
    };
    apply();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const watch = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(apply, 120); });
    watch.observe(root, { childList: true, subtree: true });
    return () => { watch.disconnect(); clearTimeout(timer); };
  }, [q]);

  return (
    <div ref={box} className="no-print" style={{ margin: "10px 0", maxWidth: 460 }}>
      <input
        type="search"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label="Search this list"
        style={{ width: "100%", padding: "11px 12px", fontSize: 16, borderRadius: 8, border: "1px solid #cbd5e1" }}
      />
      {count && (
        <small role="status" style={{ color: count.shown ? "#64748b" : "#b91c1c" }}>
          Showing {count.shown} of {count.total} on this page{count.shown === 0 ? ". Nothing matches." : "."}
        </small>
      )}
    </div>
  );
}
