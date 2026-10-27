"use client";

import { useSyncExternalStore } from "react";

export type CartLine = { variantId: number; qty: number; product: string; detail: string; price: number | null; coverId: number | null; productId: number };

const KEY = "abhiram_cart_v1";
const EVENT = "abhiram-cart";
let cache: { raw: string; lines: CartLine[] } = { raw: "[]", lines: [] };

function read(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(KEY) ?? "[]";
    if (raw !== cache.raw) cache = { raw, lines: JSON.parse(raw) as CartLine[] };
    return cache.lines;
  } catch {
    return cache.lines;
  }
}

function write(lines: CartLine[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    cache = { raw: JSON.stringify(lines), lines };
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(line: CartLine) {
  const lines = [...read()];
  const i = lines.findIndex((l) => l.variantId === line.variantId);
  if (i >= 0) lines[i] = { ...lines[i], qty: Math.min(20, lines[i].qty + line.qty) };
  else lines.push(line);
  write(lines);
}
export function setQty(variantId: number, qty: number) {
  write(read().map((l) => (l.variantId === variantId ? { ...l, qty: Math.max(1, Math.min(20, qty)) } : l)));
}
export function removeFromCart(variantId: number) {
  write(read().filter((l) => l.variantId !== variantId));
}
export function clearCart() {
  write([]);
}
export function updateCartDetails(fresh: Partial<CartLine>[]) {
  write(read().map((l) => ({ ...l, ...(fresh.find((f) => f.variantId === l.variantId) ?? {}) })));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
};
const EMPTY: CartLine[] = [];

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
