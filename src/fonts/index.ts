import localFont from "next/font/local";

/**
 * Fonts are stored in the project (SIL Open Font License, see OFL-LICENSE.txt), so building the app
 * never needs Google Fonts to be reachable, and a future mobile app can bundle the same files.
 */
export const geistSans = localFont({ src: "./geist-latin-wght-normal.woff2", variable: "--font-geist-sans", display: "swap", weight: "100 900" });
export const geistMono = localFont({ src: "./geist-mono-latin-wght-normal.woff2", variable: "--font-geist-mono", display: "swap", weight: "100 900" });
export const shopDisplay = localFont({ src: "./young-serif-latin-400-normal.woff2", variable: "--font-display", display: "swap", weight: "400" });
export const shopBody = localFont({ src: "./hanken-grotesk-latin-wght-normal.woff2", variable: "--font-body", display: "swap", weight: "100 900" });
