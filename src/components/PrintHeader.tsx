import { todayInIndia } from "@/lib/reports/money";
import { getBrand } from "@/lib/brand";

/**
 * Letterhead that appears only on paper / PDF: logo, group name, document
 * title and the print date. Hidden on screen.
 */
export default async function PrintHeader({ title, subtitle, tagline }: { title: string; subtitle?: string; tagline?: string }) {
  const brand = await getBrand();
  return (
    <div className="print-only" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "2px solid #142c50", paddingBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoPrint} alt={brand.groupName} width={64} height={64} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#142c50", letterSpacing: 0.5 }}>{brand.groupName.toUpperCase()}</div>
          {tagline && <div style={{ fontSize: 12, fontStyle: "italic", color: "#142c50" }}>{tagline}</div>}
          <div style={{ fontSize: 13, color: "#475569" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "#64748b" }}>{subtitle}</div>}
        </div>
        <div style={{ fontSize: 11, color: "#64748b", textAlign: "right" }}>Printed {todayInIndia()}</div>
      </div>
    </div>
  );
}
