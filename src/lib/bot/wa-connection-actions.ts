"use server";

import { redirect } from "next/navigation";

import { requireAccess } from "@/lib/auth";
import { subscribeWaba } from "@/lib/bot/wa-connection";

/** Owner presses 'Connect incoming messages': subscribe the WhatsApp Business Account to this Meta app. */
export async function subscribeWabaAction(form: FormData): Promise<void> {
  await requireAccess("dashboard");
  const id = String(form.get("waba_id") ?? "").trim();
  const r = await subscribeWaba(id);
  const why = r.ok ? "" : `&why=${encodeURIComponent((r.reason ?? "").slice(0, 200))}`;
  redirect(`/accounting/chatbot/log?check=1&sub=${r.ok ? "ok" : "fail"}${why}`);
}
