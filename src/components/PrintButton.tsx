"use client";

export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()}>
      {label}
    </button>
  );
}
