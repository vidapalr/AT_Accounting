import Link from "next/link";

import { taxYearLabel } from "@/lib/tax/tax-year";

/** Tabs of the income tax and year-end pack, with the tax year carried along and a year switch. */
export const TAX_TABS = [
  { href: "/accounting/tax", label: "Advance tax" },
  { href: "/accounting/tax/challans", label: "Tax paid" },
  { href: "/accounting/tax/statement", label: "Tax statement and papers" },
  { href: "/accounting/tax/loans", label: "Loans" },
  { href: "/accounting/tax/depreciation", label: "Tax depreciation" },
  { href: "/accounting/tax/year-figures", label: "Year-end figures" },
] as const;

export default function TaxPackNav({ current, year, thisYear }: { current: string; year: number; thisYear: number }) {
  const years = [thisYear - 1, thisYear, ...(year > thisYear ? [year] : [])].filter((y, i, a) => a.indexOf(y) === i);
  if (!years.includes(year)) years.unshift(year);
  return (
    <nav aria-label="Income tax pages" style={{ display: "grid", gap: 10, margin: "8px 0 16px" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {TAX_TABS.map((t) => (
          <Link key={t.href} href={`${t.href}?year=${year}`} className={t.href === current ? "btn-link btn-link-primary" : "btn-link"} aria-current={t.href === current ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", color: "#475569" }}>
        <span>Tax year:</span>
        {years.sort().map((y) => (
          <Link key={y} href={`${current}?year=${y}`} className="btn-link" style={y === year ? { fontWeight: 700, textDecoration: "underline" } : undefined}>
            {taxYearLabel(y)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
