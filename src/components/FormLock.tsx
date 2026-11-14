"use client";

import { useEffect } from "react";

/**
 * Double-press protection for every save button in the workspace.
 * After a form is sent, the same form ignores further sends for a few seconds
 * and its buttons look locked, so a second tap cannot save the same thing twice.
 * Search/filter forms (GET) are left alone.
 */
const LOCK_MS = 6000;

export default function FormLock() {
  useEffect(() => {
    const locked = new WeakSet<HTMLFormElement>();

    function onSubmit(e: Event) {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      if (form.method.toLowerCase() === "get") return;
      if (form.dataset.noLock !== undefined) return;

      if (locked.has(form)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // If another handler (e.g. a "are you sure?" box) cancelled it, do not lock.
      queueMicrotask(() => {
        if (e.defaultPrevented) return;
        locked.add(form);
        const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])'));
        // Disable after the browser has read the clicked button's value.
        setTimeout(() => buttons.forEach((b) => { b.dataset.wasEnabled = b.disabled ? "0" : "1"; b.disabled = true; }), 0);
        setTimeout(() => {
          locked.delete(form);
          buttons.forEach((b) => { if (b.dataset.wasEnabled === "1") b.disabled = false; });
        }, LOCK_MS);
      });
    }

    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  return null;
}
