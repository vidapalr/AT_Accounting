import { timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { todayInIndia } from "@/lib/reports/money";
import { isJob } from "@/lib/whatsapp/core";
import { runJob } from "@/lib/whatsapp/run";

const BUSINESS_ID = 1;

function authorised(request: Request, url: URL): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || expected.length < 16) return false;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const given = header || url.searchParams.get("secret") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  const url = new URL(request.url);
  if (!authorised(request, url)) return new Response("Forbidden", { status: 403 });

  const job = url.searchParams.get("job");
  if (!isJob(job)) return Response.json({ error: "job must be daily, morning or monthly" }, { status: 400 });

  try {
    const summary = await runJob(db, BUSINESS_ID, job, todayInIndia());
    return Response.json({ job, ...summary });
  } catch (error) {
    console.error("WhatsApp job failed", error);
    return Response.json({ error: "The job failed. See the server log." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
