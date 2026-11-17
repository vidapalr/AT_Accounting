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
