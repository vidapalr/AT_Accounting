import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
<<<<<<< HEAD
  title: "An Abhiram Group",
  description: "Abhiram Textiles is a part of Abhiram Group, a leading textile retailer specializing in high-quality fabrics and garments.",
=======
  title: "An Abhiram Group Project",
  description: "Abhiram Textiles, An Abhiram Group Project",
>>>>>>> feat/ledger-dry-run
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
