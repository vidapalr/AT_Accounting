import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import CheckoutForm from "@/components/shop/CheckoutForm";
import { getShopCustomer } from "@/lib/shop-account";

export const metadata: Metadata = { title: "Your details" };

async function Content() {
  const me = await getShopCustomer();
  if (!me) redirect("/shop/account/login?next=/shop/checkout");
  return <CheckoutForm me={{ name: me.name, email: me.email, phone: me.phone }} />;
}

export default function CheckoutPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
