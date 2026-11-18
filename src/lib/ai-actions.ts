"use server";

import { requireAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { todayInIndia } from "@/lib/reports/money";
import { askAssistant, type ChatTurn } from "@/lib/ai/assistant";

export type ChatState = { turns: ChatTurn[]; error?: string };

/** One question to the read-only assistant; the conversation so far travels with the form. */
export async function askAssistantAction(prev: ChatState, form: FormData): Promise<ChatState> {
  const user = await requireAccess("reports");
  const question = String(form.get("question") ?? "").trim().slice(0, 500);
  if (!question) return { ...prev, error: "Type a question." };
  const brand = await getBrand(user.legal_business_id);
  const answer = await askAssistant(db, { businessId: user.legal_business_id, shop: brand.groupName, today: todayInIndia(), history: prev.turns, question });
  return { turns: [...prev.turns, { role: "user" as const, text: question }, { role: "assistant" as const, text: answer }].slice(-20) };
}
