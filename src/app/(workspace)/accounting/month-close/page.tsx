import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { monthCloseChecks } from "@/lib/month-close";
import { lastFinishedMonth, monthBounds } from "@/lib/month-math";

type Props = { searchParams: Promise<{ m?: string }> };

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "12px 0" };
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const label = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const q = await searchParams;
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.m ?? "") ? String(q.m) : lastFinishedMonth(today());
  const { start } = monthBounds(ym);

  const [months] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(start_date, '%Y-%m') AS ym, status FROM acct_accounting_periods
      WHERE legal_business_id = ? AND start_date <= ? ORDER BY start_date DESC LIMIT 14`,
    [businessId, today()]
  );
  const status = months.find((m) => m.ym === ym)?.status as string | undefined;
  const checks = await monthCloseChecks(db, businessId, ym);
  const failing = checks.filter((c) => !c.ok && !c.soft).length;
  const advice = checks.filter((c) => !c.ok && c.soft).length;

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <h1>Month close: {label(ym)}</h1>
      <p style={{ color: "#64748b" }}>
        Go down the list. When everything is green, close the month on Months and years. Nothing here changes your books.
      </p>

      <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {months.map((m) => (
          <Link key={String(m.ym)} href={`/accounting/month-close?m=${m.ym}`} className="btn-link btn-link-small"
            style={{ fontWeight: m.ym === ym ? 700 : 400 }}>
            {label(String(m.ym))}
          </Link>
        ))}
      </p>

      <section style={{ ...box, background: failing === 0 ? "#f0fdf4" : "#fef2f2" }}>
        <strong style={{ color: failing === 0 ? "#166534" : "#b91c1c" }}>
          {failing === 0
            ? `Ready to close${advice ? ` (${advice} piece of advice below)` : ""}.`
            : `${failing} thing${failing === 1 ? "" : "s"} to fix before closing.`}
        </strong>
        <p style={{ margin: "6px 0 0" }}>This month is now: {status === "CLOSED" ? "closed" : status === "SOFT_CLOSED" ? "soft closed" : status === "OPEN" ? "open" : "not opened"}.</p>
      </section>

      {checks.map((c) => (
        <section key={c.key} style={box}>
          <strong style={{ color: c.ok ? "#166534" : c.soft ? "#92400e" : "#b91c1c" }}>
            {c.ok ? "✓" : c.soft ? "!" : "✗"} {c.title}
          </strong>
          <p style={{ margin: "6px 0" }}>{c.detail}</p>
          {!c.ok && <Link href={c.href} className="btn-link btn-link-small">{c.linkText}</Link>}
        </section>
      ))}

      <p>
        <Link href="/accounting/periods" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>
          Go to Months and years to close {label(ym)}
        </Link>
      </p>
      <p style={{ color: "#64748b", fontSize: 13 }}>Month starts {start}.</p>
    </main>
  );
}

export default function MonthClosePage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
