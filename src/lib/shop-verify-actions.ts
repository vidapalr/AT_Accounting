"use server";

import { redirect } from "next/navigation";

import { confirmEmail } from "@/lib/shop-verify";

export async function confirmEmailAction(formData: FormData): Promise<void> {
  const ok = await confirmEmail(String(formData.get("token") ?? ""));
  redirect(`/shop/account/verify?${ok ? "done=1" : "bad=1"}`);
}
