import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { todayInIndia } from "@/lib/format";
import { buildTaxPack } from "@/lib/tax/pack";
import { parseTaxYear } from "@/lib/tax/tax-year";

/** ZIP for the accountant: the year-end workbook and every tax paper kept for the year. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!canAccess(user.role, "tax")) return new Response("Not allowed.", { status: 403 });
  const today = todayInIndia();
  const year = parseTaxYear(new URL(request.url).searchParams.get("year") ?? undefined, today);
  const { zip, fileName } = await buildTaxPack(user.legal_business_id, year, today);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
