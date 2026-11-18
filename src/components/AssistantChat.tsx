"use client";

import { useActionState, useEffect, useRef } from "react";

import { askAssistantAction, type ChatState } from "@/lib/ai-actions";
import { bigButton, fieldFull, muted } from "@/lib/ui/styles";

const EXAMPLES = [
  "How much did we sell this month, and what were the top 5 products?",
  "Which products are not selling?",
  "What was our net profit last month?",
  "Who owes us money?",
  "How much stock of kurtis do we have?",
];

/** Chat box for the read-only assistant. The conversation is kept on this screen only. */
export default function AssistantChat() {
  const [state, action, pending] = useActionState<ChatState, FormData>(askAssistantAction, { turns: [] });
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state.error) formRef.current?.reset();
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state]);

  const ask = (q: string) => {
    const f = formRef.current;
    if (!f) return;
    (f.elements.namedItem("question") as HTMLTextAreaElement).value = q;
    f.requestSubmit();
  };

  return (
    <div>
      <div style={{ display: "grid", gap: 12, margin: "16px 0" }}>
        {state.turns.length === 0 ? (
          <div>
            <p style={muted}>Try one of these, or type your own question:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXAMPLES.map((q) => (
                <button key={q} type="button" className="btn-secondary" disabled={pending} onClick={() => ask(q)} style={{ textAlign: "left" }}>{q}</button>
              ))}
            </div>
          </div>
        ) : null}
        {state.turns.map((t, i) => (
          <div
            key={i}
            style={{
              justifySelf: t.role === "user" ? "end" : "start",
              maxWidth: "min(720px, 92%)",
              background: t.role === "user" ? "#eef4fc" : "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "10px 14px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {t.text}
          </div>
        ))}
        {pending ? <p style={muted}>Looking at your figures…</p> : null}
        <div ref={endRef} />
      </div>
      <form ref={formRef} action={action} style={{ display: "grid", gap: 8 }}>
        <label htmlFor="question" style={{ fontWeight: 600 }}>Your question</label>
        <textarea id="question" name="question" rows={2} maxLength={500} required style={fieldFull} placeholder="e.g. Which size sells most?" />
        {state.error ? <span role="alert" style={{ color: "#b91c1c" }}>{state.error}</span> : null}
        <div><button type="submit" disabled={pending} style={bigButton}>{pending ? "Thinking…" : "Ask"}</button></div>
      </form>
    </div>
  );
}
