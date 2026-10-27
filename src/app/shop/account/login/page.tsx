import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import AuthForm from "@/components/shop/AuthForm";
import { getShopCustomer } from "@/lib/shop-account";
import { safeNext } from "@/lib/shop-account-math";

export const metadata: Metadata = { title: "Log in" };

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getShopCustomer()) redirect(next);
  return <AuthForm mode="login" next={next} />;
}

export default function Page(props: { searchParams: Promise<{ next?: string }> }) {
  return <Suspense fallback={null}><Content {...props} /></Suspense>;
}
