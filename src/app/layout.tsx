import type { Metadata } from "next";
import { geistMono, geistSans } from "@/fonts";
import "./globals.css";

/** Neutral defaults; the shop and the staff app set their own titles from the company's brand settings. */
export const metadata: Metadata = {
  title: { default: "Business suite", template: "%s" },
  description: "Accounting, stock, customers and online shop.",
  applicationName: "Business suite",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
