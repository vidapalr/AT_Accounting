import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DEFAULT_LOGOS } from "./brand-core.ts";

/** A file shipped with the app (fonts under assets/, logos under public/). */
export async function appAsset(...parts: string[]): Promise<Buffer> {
  return readFile(join(/* turbopackIgnore: true */ process.cwd(), ...parts));
}

/** The logo file under public/ (a web address or missing file falls back to the default logo). */
export async function logoFile(path: string): Promise<Buffer> {
  const clean = path.startsWith("/") && !path.includes("..") ? path : DEFAULT_LOGOS.print;
  return appAsset("public", ...clean.split("/").filter(Boolean)).catch(() => appAsset("public", ...DEFAULT_LOGOS.print.split("/").filter(Boolean)));
}

/** Fonts with the rupee sign (DejaVu, shipped in assets/fonts). */
export async function pdfFonts(): Promise<{ regular: Buffer; bold: Buffer }> {
  const [regular, bold] = await Promise.all([appAsset("assets", "fonts", "DejaVuSans.ttf"), appAsset("assets", "fonts", "DejaVuSans-Bold.ttf")]);
  return { regular, bold };
}
