import "server-only";

/**
 * The read-only assistant: sends the question to the Anthropic Messages API with the lookup tools in
 * tools.ts, runs the tools the model asks for (for the signed-in company only) and returns the answer.
 * It cannot change anything: no tool writes.
 */
import type { Pool } from "mysql2/promise";

import { AI_API_KEY, AI_MODEL } from "@/lib/app-config";
import { runTool, TOOL_DEFS } from "./tools";

export type ChatTurn = { role: "user" | "assistant"; text: string };

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ApiMessage = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };

export const assistantReady = () => AI_API_KEY !== "";

const MAX_ROUNDS = 6;

function systemPrompt(shop: string, today: string): string {
  return [
    `You help the owner of ${shop}, a retail business in India, understand their own figures. Today is ${today} (India time).`,
    "Use the tools to look figures up; never guess a number. Amounts are in Indian rupees: write them like ₹1,23,456.",
    "The financial year runs 1 April to 31 March. 'This month' means from the 1st of the current month to today.",
    "Answer in short, plain words a shopkeeper uses, with the key numbers first, then one or two practical suggestions if useful.",
    "You can only read figures. If asked to change, post, send or delete anything, say that you can only answer questions and point to the screen where it is done.",
    "If the figures cannot answer the question, say so plainly.",
  ].join("\n");
}

export async function askAssistant(db: Pool, input: { businessId: number; shop: string; today: string; history: ChatTurn[]; question: string }): Promise<string> {
  if (!assistantReady()) return "The assistant is not switched on yet (no API key on the server).";
  const messages: ApiMessage[] = [
    ...input.history.slice(-8).map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: input.question },
  ];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": AI_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 1200, system: systemPrompt(input.shop, input.today), tools: TOOL_DEFS, messages }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Assistant API error", res.status, detail.slice(0, 300));
      return res.status === 401 ? "The AI key on the server is not accepted. Please check ANTHROPIC_API_KEY." : "The assistant could not answer just now. Please try again in a minute.";
    }
    const data = (await res.json()) as { content: Block[]; stop_reason: string };
    if (data.stop_reason !== "tool_use") {
      return data.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n").trim() || "I could not find an answer.";
    }
    messages.push({ role: "assistant", content: data.content as unknown as Array<Record<string, unknown>> });
    const results: Array<Record<string, unknown>> = [];
    for (const b of data.content) {
      if (b.type !== "tool_use") continue;
      let out: unknown;
      try {
        out = await runTool(db, input.businessId, b.name, b.input ?? {});
      } catch (error) {
        console.error("Assistant tool failed", b.name, error);
        out = { error: "That lookup failed." };
      }
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? Number(v) / 100 : v)).slice(0, 20000) });
    }
    messages.push({ role: "user", content: results });
  }
  return "That question needed too many lookups. Please ask something narrower.";
}
