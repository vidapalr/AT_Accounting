import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isDate, todayInIndia } from "@/lib/reports/money";
import { buildFor } from "@/lib/whatsapp/run";
import type { ReportType } from "@/lib/whatsapp/core";

/** Owner-only: build one subscription's report for today (or ?date=YYYY-MM-DD) without sending it. ?format=json shows the message values. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "GROUP_OWNER") return new Response("Not allowed.", { status: 403 });

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("subscription"));
  if (!Number.isInteger(id) || id <= 0) return new Response("Missing subscription.", { status: 400 });

  const [rows] = await db.execute<import("mysql2").RowDataPacket[]>(
    `SELECT s.id, s.recipient_id, s.report_type, s.division_id, s.branch_id, r.full_name, r.phone_e164, r.investor_party_id
     FROM acct_whatsapp_subscriptions s JOIN acct_whatsapp_recipients r ON r.id = s.recipient_id
     WHERE s.legal_business_id = ? AND s.id = ?`,
    [user.legal_business_id, id]
  );
  const r = rows[0];
  if (!r) return new Response("Not found.", { status: 404 });

  try {
    const built = await buildFor(
      db,
      user.legal_business_id,
      {
        id: Number(r.id),
        recipientId: Number(r.recipient_id),
        type: String(r.report_type) as ReportType,
        divisionId: r.division_id === null ? null : Number(r.division_id),
        branchId: r.branch_id === null ? null : Number(r.branch_id),
        name: String(r.full_name),
        phone: String(r.phone_e164),
        partyId: r.investor_party_id === null ? null : Number(r.investor_party_id),
      },
      isDate(url.searchParams.get("date") ?? undefined) ? url.searchParams.get("date")! : todayInIndia()
    );
    if (url.searchParams.get("format") === "json") {
      return Response.json({ params: built.content.params, empty: !!built.content.empty, sections: built.content.sections.map((s) => s.heading) });
    }
    return new Response(new Uint8Array(built.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${built.filename}"`, "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("WhatsApp preview failed", error);
    return new Response(error instanceof Error ? error.message : "Preview failed.", { status: 500 });
  }
}
