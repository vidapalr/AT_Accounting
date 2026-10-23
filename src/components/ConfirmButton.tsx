"use client";

/** A submit button that asks "are you sure?" first. */
export default function ConfirmButton({ label, question, className = "btn-link" }: { label: string; question: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      style={{ cursor: "pointer" }}
      onClick={e => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
