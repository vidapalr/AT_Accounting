import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { loadGstConfig } from "@/lib/gst/data";
import { buildGstWorkbook } from "@/lib/gst/export";
import { periodRange } from "@/lib/gst/returns";

/** GST return tables of a month (a quarter on composition) as an Excel file. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!canAccess(user.role, "tax")) return new Response("Not allowed.", { status: 403 });
  const ym = new URL(request.url).searchParams.get("ym") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return new Response("Choose a month.", { status: 400 });
  const cfg = await loadGstConfig(db, user.legal_business_id);
  const range = periodRange(cfg.scheme === "COMPOSITION" ? "QUARTER" : "MONTH", ym);
  const { buffer, fileName } = await buildGstWorkbook(user.legal_business_id, range.from, range.to, range.label);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
