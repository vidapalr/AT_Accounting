"use client";

import { useState } from "react";

/** One tap copies the ready-made message, to paste into WhatsApp or Instagram. */
export default function CopyTextButton({ text, label = "Copy message" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-link"
      style={{ cursor: "pointer" }}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy this message:", text);
        }
      }}
    >
      {done ? "Copied ✔" : label}
    </button>
  );
}
