"use client";

import { useActionState, useEffect, useState } from "react";

import { revealPasswordAction, type RevealState } from "@/lib/registration-actions";

/** "Show password" button: asks the server, shows it for 30 seconds, then hides it again. */
export default function RevealPassword({ id }: { id: number }) {
  const [state, action, pending] = useActionState<RevealState, FormData>(revealPasswordAction, null);
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
        <button type="submit" className="btn-link" disabled={pending} style={{ cursor: "pointer" }}>{pending ? "Opening…" : "Show password"}</button>
      )}
      {state?.error ? <span role="alert" style={{ color: "#b91c1c" }}>{state.error}</span> : null}
    </form>
  );
}
