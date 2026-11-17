import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import Letterhead from "@/components/Letterhead";
import PayslipView, { PAYSLIP_SELECT } from "@/components/PayslipView";

type Props = { params: Promise<{ id: string }> };

async function Content({ params }: Props) {
  const user = await requireAccess("salary");
  const { id } = await params;
  if (!/^[1-9]\d{0,12}$/.test(id)) notFound();
  const [rows] = await db.query<RowDataPacket[]>(`${PAYSLIP_SELECT} WHERE p.legal_business_id = ? AND p.id = ?`, [user.legal_business_id, Number(id)]);
  const p = rows[0];
  if (!p) notFound();
  return (
    <main style={{ maxWidth: 794, margin: "0 auto", padding: 24 }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 14mm; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Link className="btn-link" href={`/accounting/payroll?month=${p.salary_month}`}>← Payroll</Link>
        <Link className="btn-link" href={`/accounting/salaries/${p.employee_id}`}>Staff record</Link>
        <PrintButton label="Print" />
      </div>
      <section data-print-sheet style={{ border: "1px solid #cbd5e1", padding: 24, background: "#fff", color: "#0f172a" }}>
        <Letterhead />
        <PayslipView p={p} />
      </section>
    </main>
  );
}

export default function PayslipPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
