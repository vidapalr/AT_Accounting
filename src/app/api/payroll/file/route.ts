import type { NextRequest } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { getBrand } from "@/lib/brand";
import { toPaise } from "@/lib/payroll/data";
import { fyStartOf } from "@/lib/payroll/engine";
import { esiSheet, payrollRegister, pfEcr, ptRegister, salaryTdsDetails, type PayslipRow } from "@/lib/payroll/files";

/** Payroll files for the portals and the accountant. Staff who can run salaries only. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!canAccess(user.role, "salary")) return new Response("Not allowed.", { status: 403 });
  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !["ecr", "esi", "pt", "tds", "register"].includes(kind)) return new Response("Bad request.", { status: 400 });

  // TDS details cover the quarter the month falls in (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar).
  let from = month;
  let to = month;
  if (kind === "tds") {
    const [y, m] = month.split("-").map(Number);
    const qStart = m >= 4 ? Math.floor((m - 4) / 3) * 3 + 4 : 1;
    from = `${y}-${String(qStart).padStart(2, "0")}`;
    to = `${y}-${String(qStart + 2).padStart(2, "0")}`;
  }
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT p.*, e.full_name, e.name_as_per_uan, e.uan, e.esi_number, e.pan, DATE_FORMAT(p.paid_on, '%Y-%m-%d') AS paid
       FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.status = 'PAID' AND p.salary_month BETWEEN ? AND ?
      ORDER BY p.salary_month, e.full_name`,
    [user.legal_business_id, from, to]
  );
  const slips: PayslipRow[] = rows.map((r) => ({
    employeeName: String(r.full_name), nameAsPerUan: r.name_as_per_uan ? String(r.name_as_per_uan) : null,
    uan: r.uan ? String(r.uan) : null, esiNumber: r.esi_number ? String(r.esi_number) : null, pan: r.pan ? String(r.pan) : null,
    month: String(r.salary_month), daysInMonth: Number(r.days_in_month), paidDays: Math.floor(Number(r.paid_days)),
    gross: toPaise(r.gross), pfWages: toPaise(r.pf_wages), epsWages: toPaise(r.eps_wages), edliWages: toPaise(r.edli_wages), esiWages: toPaise(r.esi_wages),
    empPf: toPaise(r.emp_pf), erEps: toPaise(r.er_eps), erEpf: toPaise(r.er_epf), empEsi: toPaise(r.emp_esi), erEsi: toPaise(r.er_esi),
    pt: toPaise(r.emp_pt), tds: toPaise(r.emp_tds), paidOn: r.paid ? String(r.paid) : null,
  }));

  const slug = (await getBrand(user.legal_business_id)).fileSlug;
  const section = fyStartOf(month) >= 2026 ? "392" : "192"; // salary TDS section: Income-tax Act 2025 / 1961
  const out =
    kind === "ecr" ? { ...pfEcr(slips), name: `${slug}-pf-ecr-${month}.txt`, type: "text/plain" } :
    kind === "esi" ? { ...esiSheet(slips), name: `${slug}-esi-${month}.csv`, type: "text/csv" } :
    kind === "pt" ? { ...ptRegister(slips), name: `${slug}-professional-tax-${month}.csv`, type: "text/csv" } :
    kind === "tds" ? { ...salaryTdsDetails(slips, section), name: `${slug}-salary-tds-${from}-to-${to}.csv`, type: "text/csv" } :
    { content: payrollRegister(slips), skipped: [] as string[], name: `${slug}-payroll-${month}.csv`, type: "text/csv" };

  // The ECR must contain member lines only; anything left out is reported in a header instead.
  const body = kind !== "ecr" && out.skipped.length ? `${out.content}\n# Left out: ${out.skipped.join("; ")}\n` : out.content;
  return new Response(body, {
    headers: {
      "Content-Type": `${out.type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${out.name}"`,
      "Cache-Control": "no-store",
      ...(out.skipped.length ? { "X-Left-Out": encodeURIComponent(out.skipped.join("; ")).slice(0, 2000) } : {}),
    },
  });
}
