"use client";

import { useState } from "react";
import { logPrintAction } from "@/lib/document-register-actions";

// The looks that matter on paper. Copied from the screen so the saved copy opens exactly as printed.
const LOOKS = [
  "display", "position", "box-sizing", "width", "max-width", "min-width", "height", "min-height",
  "margin", "padding", "border", "border-top", "border-bottom", "border-left", "border-right", "border-collapse", "border-radius",
  "color", "background-color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
  "text-align", "text-transform", "text-decoration", "vertical-align", "white-space",
  "flex-direction", "flex-wrap", "flex", "justify-content", "align-items", "align-self", "gap",
  "grid-template-columns", "list-style",
];

/** A copy of the paper with its looks written into it, without buttons, forms or anything marked no-print. */
function snapshot(sheet: HTMLElement): string {
  const clone = sheet.cloneNode(true) as HTMLElement;
  const pairs: Array<[Element, Element]> = [[sheet, clone]];
  const walk = (a: Element, b: Element) => {
    for (let i = 0; i < a.children.length; i++) {
      pairs.push([a.children[i], b.children[i]]);
      walk(a.children[i], b.children[i]);
    }
  };
  walk(sheet, clone);
  const drop: Element[] = [];
  for (const [orig, copy] of pairs) {
    if (orig.classList.contains("no-print") || ["SCRIPT", "FORM", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "NAV"].includes(orig.tagName)) {
      drop.push(copy);
      continue;
    }
    const cs = getComputedStyle(orig);
    let css = "";
    for (const prop of LOOKS) css += `${prop}:${cs.getPropertyValue(prop)};`;
    if (orig.classList.contains("print-only")) css += "display:block;";
    (copy as HTMLElement).setAttribute("style", css);
    copy.removeAttribute("class");
  }
  for (const el of drop) el.remove();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Saved copy</title></head><body style="margin:0;padding:16px;background:#fff;font-family:Arial,Helvetica,sans-serif">${clone.outerHTML}</body></html>`;
}

export default function LoggedPrintButton(props: {
  docType: "INVOICE" | "ESTIMATE" | "VOUCHER" | "EXPENSE_RECORD";
  sourceId: number;
  docRef: string;
  printedBefore: number;
  label?: string;
}) {
  const [printed, setPrinted] = useState(props.printedBefore);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setError("");
    if (printed > 0 && reason.trim().length < 3) {
      setError("Write a reason for printing this again.");
      return;
    }
    const sheet = document.querySelector<HTMLElement>("[data-print-sheet]");
    if (!sheet) { window.print(); return; }
    setBusy(true);
    try {
      const res = await logPrintAction({ docType: props.docType, sourceId: props.sourceId, docRef: props.docRef, reason, html: snapshot(sheet) });
      if (!res.ok) { setError(res.error); return; }
      setPrinted((n) => n + 1);
      setReason("");
      window.print();
    } catch {
      // Never hold up a bill because the note could not be saved.
      window.print();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="no-print" style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {printed > 0 && (
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}>
          Printed before. Reason to print again:
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. customer lost the copy" style={{ padding: 8, minWidth: 220 }} />
        </label>
      )}
      <button type="button" onClick={go} disabled={busy}>{props.label ?? "Print"}</button>
      {error && <span role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>{error}</span>}
    </span>
  );
}
