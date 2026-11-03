import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import { BRAND_NAME, SHOP_PHONE, SHOP_EMAIL, SHOP_WEBSITES } from "@/lib/brand";
import { DEFAULT_TERMS, LETTER_TYPES, buildLetter, type LetterType, type Terms } from "@/lib/staff-letters";

type SP = { type?: string; title?: string; notice?: string; probation?: string; hours?: string; off?: string; leaves?: string; month?: string };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<SP> };

const field: React.CSSProperties = { display: "block", padding: 10, fontSize: 16, width: "100%", marginTop: 4 };
const dmy = (v: unknown) => (v ? new Date(v as string).toLocaleDateString("en-GB").replaceAll("/", "-") : "");
const inr = (v: unknown) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const clean = (v: string | undefined, max: number, fallback: string) => (v ?? "").trim().slice(0, max) || fallback;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("salary");
  const { id } = await params;
  const q = await searchParams;
  if (!/^[1-9]\d{0,9}$/.test(id)) notFound();
  const businessId = user.legal_business_id;

  const [emp] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM acct_employees WHERE legal_business_id = ? AND id = ?`, [businessId, Number(id)]);
  const e = emp[0];
  if (!e) notFound();

  const type: LetterType = LETTER_TYPES.some((t) => t.key === q.type) ? (q.type as LetterType) : "appointment";
  const terms: Terms = {
    noticeDays: clean(q.notice, 3, DEFAULT_TERMS.noticeDays).replace(/\D/g, "") || DEFAULT_TERMS.noticeDays,
    probationDays: clean(q.probation, 3, DEFAULT_TERMS.probationDays).replace(/\D/g, "") || "0",
    hours: clean(q.hours, 60, DEFAULT_TERMS.hours),
    weeklyOff: clean(q.off, 60, DEFAULT_TERMS.weeklyOff),
    leaves: clean(q.leaves, 3, DEFAULT_TERMS.leaves).replace(/\D/g, "") || "0",
  };
  const title = ["Mr.", "Ms.", "Mrs."].includes(q.title ?? "") ? String(q.title) : "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") ? String(q.month) : today().slice(0, 7);

  const [branch] = await db.execute<RowDataPacket[]>(
    `SELECT address_line1, address_line2, city, state, postal_code FROM acct_branches
      WHERE legal_business_id = ? AND id = ? LIMIT 1`, [businessId, Number(e.branch_id ?? 0)]);
  const b = branch[0];
  const address = [b?.address_line1, b?.address_line2, b?.city, b?.state, b?.postal_code].filter(Boolean).join(", ") || "Kapra, Hyderabad";

  const ctx = {
    title, name: String(e.full_name), jobTitle: String(e.job_title ?? ""),
    salary: inr(e.monthly_salary), joinedOn: dmy(e.joined_on), noticeGivenOn: dmy(e.notice_given_on),
    leftOn: dmy(e.left_on), letterDate: dmy(today()), place: String(b?.city ?? "Hyderabad"), terms,
  };

  let slip: RowDataPacket | null = null;
  if (type === "payslip") {
    const [s] = await db.execute<RowDataPacket[]>(
      `SELECT amount, advance_deducted, DATE_FORMAT(paid_on, '%d-%m-%Y') AS p FROM acct_salary_payments
        WHERE legal_business_id = ? AND employee_id = ? AND salary_month = ?`, [businessId, Number(id), month]);
    slip = s[0] ?? null;
  }
  const letter = type === "payslip" ? null : buildLetter(type, ctx);
  const [yy, mm] = month.split("-");

  return (
    <main style={{ maxWidth: 794, margin: "0 auto", padding: 24 }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 14mm; } }`}</style>
      <div className="no-print">
        <Link className="btn-link" href={`/accounting/salaries/${id}`}>← {ctx.name}</Link>
        <h1>Letters for {ctx.name}</h1>
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
          <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
            <button type="submit" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>Show the paper</button>
            <PrintButton label="Print" />
          </div>
        </form>
        <p style={{ color: "#64748b", fontSize: 13 }}>
          Check the terms above, press Show the paper, read it, then Print. Anything in [square brackets] is missing from the staff record: fill it on the person&apos;s Staff record page first.
        </p>
      </div>

      <section data-print-sheet style={{ border: "1px solid #cbd5e1", padding: 28, background: "#fff", color: "#0f172a", lineHeight: 1.6 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", borderBottom: "2px solid #142c50", paddingBottom: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/abhiram-logo-print.png" alt="Abhiram Group" width={72} height={72} />
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#142c50" }}>ABHIRAM GROUP</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#142c50" }}>{BRAND_NAME}</div>
            <div style={{ fontSize: 12, color: "#475569" }}>{address}</div>
            <div style={{ fontSize: 12, color: "#475569" }}>Phone {SHOP_PHONE} · {SHOP_EMAIL}</div>
            <div style={{ fontSize: 12, color: "#475569" }}>{SHOP_WEBSITES}</div>
          </div>
        </div>

        {letter ? (
          <>
            <p style={{ textAlign: "right", margin: "16px 0 4px" }}>Date: {ctx.letterDate}</p>
            <p style={{ margin: "4px 0" }}>To: {title ? `${title} ` : ""}{ctx.name}{ctx.jobTitle ? `, ${ctx.jobTitle}` : ""}</p>
            <h2 style={{ textAlign: "center", textDecoration: "underline", margin: "18px 0" }}>{letter.heading}</h2>
            {letter.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
            {letter.points && (
              <ol style={{ paddingLeft: 22 }}>
                {letter.points.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}
              </ol>
            )}
            {(type === "offer" || type === "appointment") && (
              <p>Please sign and return a copy of this letter to confirm that you accept these terms.</p>
            )}
            <p style={{ marginTop: 36 }}>For ABHIRAM GROUP</p>
            <p style={{ marginTop: 40 }}>_____________________________<br />Authorised signatory</p>
            {(type === "offer" || type === "appointment") && (
              <p style={{ marginTop: 28 }}>I accept the above terms.<br /><br />_____________________________ &nbsp;&nbsp; Date: ______________<br />{title ? `${title} ` : ""}{ctx.name}</p>
            )}
          </>
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
            <p style={{ marginTop: 36 }}>For ABHIRAM GROUP<br /><br />_____________________________<br />Authorised signatory</p>
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
