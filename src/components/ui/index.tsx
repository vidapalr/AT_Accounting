/**
 * Screen kit: the building blocks every staff screen uses, so pages look and behave the same.
 * Start a new screen from docs/templates/SCREEN_TEMPLATE.md. Server-safe (no "use client").
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { box, muted } from "@/lib/ui/styles";

/** Page title, one line saying what the page is for, and the main actions on the right. */
export function PageHeader({ title, intro, back, actions }: { title: string; intro?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header style={{ marginBottom: 16 }}>
      {back ? <p style={{ margin: "0 0 6px" }}><Link className="btn-link" href={back.href}>← {back.label}</Link></p> : null}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
      {intro ? <p style={{ color: "#475569", margin: "6px 0 0" }}>{intro}</p> : null}
    </header>
  );
}

const TONES = {
  ok: { background: "#f0fdf4", border: "#86efac", color: "#14532d" },
  error: { background: "#fef2f2", border: "#fca5a5", color: "#7f1d1d" },
  info: { background: "#eff6ff", border: "#93c5fd", color: "#1e3a8a" },
  warn: { background: "#fffbeb", border: "#fcd34d", color: "#78350f" },
} as const;

export type NoticeTone = keyof typeof TONES;

/** A short message after an action: saved, refused, or something to know. */
export function Notice({ tone = "info", children }: { tone?: NoticeTone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} style={{ background: t.background, border: `1px solid ${t.border}`, color: t.color, borderRadius: 8, padding: "10px 14px", margin: "12px 0" }}>
      {children}
    </p>
  );
}

/** Shows the message for ?result=<key> from a table of messages; nothing when there is no result. */
export function ResultNotice({ result, messages }: { result?: string; messages: Record<string, { tone: NoticeTone; text: string }> }) {
  const m = result ? messages[result] : undefined;
  return m ? <Notice tone={m.tone}>{m.text}</Notice> : null;
}

/** A bordered part of a page with its own heading. */
export function Section({ title, children, aside }: { title?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section style={box}>
      {title || aside ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
          {title ? <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A labelled form field with an optional hint underneath. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint ? <span style={muted}>{hint}</span> : null}
    </label>
  );
}

/** What to show when a list has nothing in it, with the next step. */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ ...box, textAlign: "center", color: "#475569" }}>
      <p style={{ margin: "0 0 8px" }}>{children}</p>
      {action}
    </div>
  );
}

/** Tabs as links (?tab=...), so each tab can be bookmarked and works without JavaScript. */
export function Tabs({ tabs, current, base }: { tabs: Array<{ key: string; label: string; count?: number }>; current: string; base: string }) {
  return (
    <nav aria-label="Sections" style={{ display: "flex", gap: 4, borderBottom: "2px solid #e2e8f0", margin: "18px 0 4px", overflowX: "auto" }}>
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Link key={t.key} href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.key}`} aria-current={on ? "page" : undefined}
            style={{ padding: "10px 16px", fontWeight: on ? 700 : 500, color: on ? "#142c50" : "#475569", borderBottom: on ? "3px solid #142c50" : "3px solid transparent", marginBottom: -2, textDecoration: "none", whiteSpace: "nowrap" }}>
            {t.label}{t.count != null ? <span style={{ marginLeft: 6, color: "#64748b", fontWeight: 500 }}>({t.count})</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

const BADGE = {
  ok: { background: "#dcfce7", color: "#166534" },
  wait: { background: "#fef3c7", color: "#92400e" },
  bad: { background: "#fee2e2", color: "#b91c1c" },
  info: { background: "#e0e7ff", color: "#3730a3" },
  plain: { background: "#f1f5f9", color: "#475569" },
} as const;

/** A small coloured status label (Accepted, Waiting, Failed...). Always has words, never colour alone. */
export function Badge({ tone = "plain", children, title }: { tone?: keyof typeof BADGE; children: ReactNode; title?: string }) {
  return <span title={title} style={{ ...BADGE[tone], borderRadius: 999, padding: "2px 10px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

/** A figure with a label, for the row of key facts at the top of a record. */
export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px", background: "#fff", minWidth: 0 }}>
      <div style={{ color: "#64748b", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{value}</div>
      {note ? <div style={{ color: "#64748b", fontSize: 12.5, marginTop: 2 }}>{note}</div> : null}
    </div>
  );
}
