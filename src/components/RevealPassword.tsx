"use client";

import { useActionState, useEffect, useState } from "react";

import { revealPasswordAction, type RevealState } from "@/lib/registration-actions";

type RevealAction = (prev: RevealState, form: FormData) => Promise<RevealState>;

/** "Show password" button: asks the server, shows it for 30 seconds, then hides it again.
 *  Also used for other secrets (an account number) by passing that secret's server action and a label. */
export default function RevealPassword({ id, reveal = revealPasswordAction, label = "Show password" }: { id: number; reveal?: RevealAction; label?: string }) {
  const [state, action, pending] = useActionState<RevealState, FormData>(reveal, null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!state?.password) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 30000);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="id" value={id} />
      {visible && state?.password ? (
        <>
          <code style={{ background: "#f0efec", padding: "2px 6px", borderRadius: 4, userSelect: "all" }}>{state.password}</code>
          <button type="button" className="btn-link" onClick={() => navigator.clipboard?.writeText(state.password ?? "")}>Copy</button>
          <button type="button" className="btn-link" onClick={() => setVisible(false)}>Hide</button>
        </>
      ) : (
        <button type="submit" className="btn-link" disabled={pending} style={{ cursor: "pointer" }}>{pending ? "Opening…" : label}</button>
      )}
      {state?.error ? <span role="alert" style={{ color: "#b91c1c" }}>{state.error}</span> : null}
    </form>
  );
}
