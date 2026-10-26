import { timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { autoPostPending } from "@/lib/ledger/auto-post";

const BUSINESS_ID = 1;

function authorised(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || expected.length < 16) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!authorised(request)) return new Response("Forbidden", { status: 403 });
  try {
    return Response.json(await autoPostPending(db, BUSINESS_ID, { force: true }));
  } catch (error) {
    console.error("Auto-post failed", error);
    return Response.json({ error: "Auto-post failed. See the server log." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
