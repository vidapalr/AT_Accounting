"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireGroupOwner } from "@/lib/auth";
import { saveBusinessSettings } from "@/lib/business-settings";
import { BRAND_KEYS } from "@/lib/brand-core";
import { OPTIONAL_MODULES } from "@/lib/navigation";

const PAGE = "/accounting/brand";
const LOGO = /^(\/[A-Za-z0-9._\/-]+|https:\/\/[^\s"'<>]+)$/;

/** Save the words, numbers and logos printed for this company, and which modules it uses. Owner only. */
export async function saveBrandAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const values: Record<string, string> = {};
  for (const [field, key] of Object.entries(BRAND_KEYS)) {
    const v = String(form.get(key) ?? "").replace(/\s+/g, " ").trim().slice(0, 255);
    if (field.startsWith("logo") && v && !LOGO.test(v)) redirect(`${PAGE}?result=logo`);
    if (["mapLink", "instagram", "facebook", "youtube"].includes(field) && v && !/^https:\/\/[^\s"'<>]+$/.test(v)) redirect(`${PAGE}?result=link`);
    values[key] = v;
  }
  values.shop_nav_links = String(form.get("shop_nav_links") ?? "").trim().slice(0, 255);
  const code = String(form.get("doc_business_code") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  if (code && code.length < 2) redirect(`${PAGE}?result=code`);
  values.doc_business_code = code;
  values.modules_off = OPTIONAL_MODULES.filter((m) => form.get(`module_${m.key}`) !== "1").map((m) => m.key).join(",");
  await saveBusinessSettings(user.legal_business_id, values, user.id);
  revalidatePath("/", "layout");
  redirect(`${PAGE}?result=saved`);
}
