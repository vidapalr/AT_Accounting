import type { CSSProperties } from "react";

/**
 * Shared look for screens (owner's design rules: one calm scheme, big obvious buttons, phone-friendly).
 * Use these instead of writing the same style object again in each page.
 * They are plain objects, so a future mobile app can map them to its own styles.
 */

/** Table cell. */
export const cell: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
/** Table cell, roomier and top-aligned (for cells with several lines). */
export const cellTop: CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
/** Table cell, compact and top-aligned. */
export const cellTopCompact: CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };

/** A bordered section of a page. */
export const box: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
/** A white card. */
export const card: CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 16 };

/** Form input sized for fingers. */
export const field: CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
/** Form input that fills its column. */
export const fieldFull: CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0, width: "100%" };
/** Form input under its label. */
export const fieldBlock: CSSProperties = { display: "block", padding: 10, fontSize: 16, width: "100%", marginTop: 4 };

/** Big primary button (use with className="btn-link btn-link-primary"). */
export const bigButton: CSSProperties = { fontSize: 16, padding: "12px 22px" };

/** Muted helper text. */
export const muted: CSSProperties = { color: "#64748b", fontSize: 13 };

/** A responsive grid of form fields. */
export const formGrid: CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" };
