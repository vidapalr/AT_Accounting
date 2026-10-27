import { Suspense } from "react";
import type { Metadata } from "next";

import ResetForm from "@/components/shop/ResetForm";

export const metadata: Metadata = { title: "New password" };

async function Content({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = String((await searchParams).token ?? "");
  return <ResetForm token={/^[a-f0-9]{64}$/.test(token) ? token : "invalid"} />;
}

export default function Page(props: { searchParams: Promise<{ token?: string }> }) {
  return <Suspense fallback={null}><Content {...props} /></Suspense>;
}
