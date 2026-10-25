"use client";

import { useFormStatus } from "react-dom";

/** A submit button that locks while the form is being saved, so a double tap cannot save twice. */
export default function SubmitButton({
  label,
  className = "btn-link btn-link-primary",
  question,
}: {
  label: string;
  className?: string;
  /** If set, asks "are you sure?" first. */
  question?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      style={{ cursor: "pointer", fontSize: 16, padding: "12px 22px" }}
      onClick={(e) => {
        if (question && !window.confirm(question)) e.preventDefault();
      }}
    >
      {pending ? "Saving..." : label}
    </button>
  );
}
