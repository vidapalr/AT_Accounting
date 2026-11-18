import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import Letterhead from "@/components/Letterhead";
import { LETTER_TYPES } from "@/lib/staff-letters";
import { loadStaffLetter } from "@/lib/staff-letter-data";
import { getBrand } from "@/lib/brand";
import { keepLetterAction, keepPayslipAction } from "@/lib/staff-paper-actions";
import { fieldBlock as field } from "@/lib/ui/styles";
import PayslipView, { PAYSLIP_SELECT } from "@/components/PayslipView";

type SP = { saved?: string; error?: string; type?: string; title?: string; notice?: string; probation?: string; hours?: string; off?: string; leaves?: string; month?: string; new_salary?: string; effective?: string; reason?: string };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<SP> };

const inr = (v: unknown) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("salary");
  const { id } = await params;
  const q = await searchParams;
  if (!/^[1-9]\d{0,9}$/.test(id)) notFound();
  const businessId = user.legal_business_id;
  const loaded = await loadStaffLetter(businessId, Number(id), q);
  if (!loaded) notFound();
  const { type, ctx, address, month } = loaded;
  const { terms, title } = ctx;
  const brand = await getBrand(businessId);

  let slip: RowDataPacket | null = null;
  let fullSlip: RowDataPacket | null = null;
  if (type === "payslip") {
    const [s] = await db.execute<RowDataPacket[]>(
      `SELECT amount, advance_deducted, DATE_FORMAT(paid_on, '%d-%m-%Y') AS p FROM acct_salary_payments
        WHERE legal_business_id = ? AND employee_id = ? AND salary_month = ?`, [businessId, Number(id), month]);
    slip = s[0] ?? null;
    try {
      const [full] = await db.query<RowDataPacket[]>(`${PAYSLIP_SELECT} WHERE p.legal_business_id = ? AND p.employee_id = ? AND p.salary_month = ?`, [businessId, Number(id), month]);
      fullSlip = full[0] ?? null;
    } catch { /* before migration 088: the short pay slip below */ }
  }
  const letter = loaded.letter;
  const [yy, mm] = month.split("-");

  return (
    <main style={{ maxWidth: 794, margin: "0 auto", padding: 24 }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 14mm; } }`}</style>
      <div className="no-print">
        <Link className="btn-link" href={`/accounting/salaries/${id}`}>← {ctx.name}</Link>
        <h1>Letters for {ctx.name}</h1>
        {q.saved ? <p role="status" style={{ color: "#166534" }}>{q.saved}</p> : null}
        {q.error ? <p role="alert" style={{ color: "#b91c1c" }}>{q.error}</p> : null}
        <form method="get" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", margin: "12px 0" }}>
          <label>Which paper
            <select name="type" defaultValue={type} style={field}>
              {LETTER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </label>
          <label>Call the person
            <select name="title" defaultValue={title} style={field}>
              <option value="">Just the name</option><option>Mr.</option><option>Ms.</option><option>Mrs.</option>
            </select>
          </label>
          <label>Notice period (days)<input name="notice" defaultValue={terms.noticeDays} inputMode="numeric" style={field} /></label>
          <label>Probation (days, 0 = none)<input name="probation" defaultValue={terms.probationDays} inputMode="numeric" style={field} /></label>
          <label>Working hours<input name="hours" defaultValue={terms.hours} style={field} /></label>
          <label>Weekly off<input name="off" defaultValue={terms.weeklyOff} style={field} /></label>
          <label>Paid leaves in a year (0 = none)<input name="leaves" defaultValue={terms.leaves} inputMode="numeric" style={field} /></label>
          <label>Pay slip month<input type="month" name="month" defaultValue={month} style={field} /></label>
          <label>New monthly salary (salary increase)<input name="new_salary" defaultValue={q.new_salary ?? ""} inputMode="decimal" style={field} /></label>
          <label>Change starts on<input type="date" name="effective" defaultValue={q.effective ?? ""} style={field} /></label>
          <label>Reason (warning letter)<input name="reason" defaultValue={ctx.reason} maxLength={300} style={field} /></label>
          <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
            <button type="submit" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>Show the paper</button>
            <PrintButton label="Print" />
          </div>
        </form>
        {type === "payslip" ? (
          <form action={keepPayslipAction} style={{ margin: "8px 0" }}>
            <input type="hidden" name="employee_id" value={String(id)} />
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="btn-link" style={{ cursor: "pointer" }}>Keep this pay slip in {ctx.name}&apos;s folder</button>
          </form>
        ) : (
          <form action={keepLetterAction} style={{ margin: "8px 0" }}>
            <input type="hidden" name="employee_id" value={String(id)} />
            {([["type", type], ["title", title], ["notice", terms.noticeDays], ["probation", terms.probationDays], ["hours", terms.hours],
               ["off", terms.weeklyOff], ["leaves", terms.leaves], ["month", month], ["new_salary", q.new_salary ?? ""],
               ["effective", q.effective ?? ""], ["reason", ctx.reason]] as Array<[string, string]>).map(([n, v]) => (
              <input key={n} type="hidden" name={n} value={v} />
            ))}
            <button type="submit" className="btn-link" style={{ cursor: "pointer" }}>Keep this letter in {ctx.name}&apos;s folder</button>
          </form>
        )}
        <p style={{ color: "#64748b", fontSize: 13 }}>
          The wording of each letter can be changed on <Link href="/accounting/letter-templates">Letter templates</Link>. Check the terms above, press Show the paper, read it, then Print. Keeping it in the folder saves a PDF under the person&apos;s <Link href={`/accounting/salaries/${id}`}>staff record</Link>. Anything in [square brackets] is missing from the staff record: fill it on the person&apos;s Staff record page first.
        </p>
      </div>

      <section data-print-sheet style={{ border: "1px solid #cbd5e1", padding: 28, background: "#fff", color: "#0f172a", lineHeight: 1.6 }}>
        <Letterhead address={address} />

        {letter ? (
          <>
            <p style={{ textAlign: "right", margin: "16px 0 4px" }}>Date: {ctx.letterDate}</p>
            <p style={{ margin: "4px 0" }}>To: {title ? `${title} ` : ""}{ctx.name}{ctx.jobTitle ? `, ${ctx.jobTitle}` : ""}</p>
            <h2 style={{ textAlign: "center", textDecoration: "underline", margin: "18px 0" }}>{letter.heading}</h2>
            {letter.blocks.map((block, i) => block.kind === "p" ? <p key={i}>{block.text}</p> : (
              <ol key={i} style={{ paddingLeft: 22 }}>
                {block.items.map((t, j) => <li key={j} style={{ marginBottom: 4 }}>{t}</li>)}
              </ol>
            ))}
            <p style={{ marginTop: 36 }}>For {brand.groupName.toUpperCase()}</p>
            <p style={{ marginTop: 40 }}>_____________________________<br />Authorised signatory</p>
            {letter.needsAcceptance && (
              <p style={{ marginTop: 28 }}>I accept the above terms.<br /><br />_____________________________ &nbsp;&nbsp; Date: ______________<br />{title ? `${title} ` : ""}{ctx.name}</p>
            )}
          </>
        ) : fullSlip ? (
          <PayslipView p={fullSlip} />
        ) : (
          <>
            <h2 style={{ textAlign: "center", margin: "18px 0" }}>PAY SLIP: {MONTHS[Number(mm) - 1]} {yy}</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {([
                  ["Name", ctx.name], ["Job", ctx.jobTitle || "—"], ["Monthly salary", `₹${ctx.salary}`],
                  ...(slip ? [
                    ["Taken off for advance", Number(slip.advance_deducted) > 0 ? `₹${inr(slip.advance_deducted)}` : "—"],
                    ["Amount paid", `₹${inr(slip.amount)}`], ["Paid on", String(slip.p)],
                  ] : [["Status", "Not paid yet for this month"]]),
                ] as string[][]).map(([k, v]) => (
                  <tr key={k}><td style={{ border: "1px solid #334155", padding: "8px 10px", fontWeight: 700, width: "40%" }}>{k}</td><td style={{ border: "1px solid #334155", padding: "8px 10px" }}>{v}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 36 }}>For {brand.groupName.toUpperCase()}<br /><br />_____________________________<br />Authorised signatory</p>
          </>
        )}
      </section>
    </main>
  );
}

export default function StaffLettersPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
