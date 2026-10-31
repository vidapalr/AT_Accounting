import { BRAND_NAME, TAGLINE } from "@/lib/brand";
import { todayInIndia } from "@/lib/reports/money";

/**
 * Letterhead for a bill or estimate on paper / PDF: shop name, shop address and phone,
 * the document number and date, and who it is for. Hidden on screen.
 */
export default function DocumentHeader(props: {
  title: string; // e.g. "Invoice AB_AT_KA_SA_12" or "Estimate EST-0004"
  date: string;
  shopAddress: string;
  shopPhone?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  note?: string;
}) {
  return (
    <div className="print-only" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "2px solid #142c50", paddingBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/abhiram-logo-print.png" alt={BRAND_NAME} width={64} height={64} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#142c50", letterSpacing: 0.5 }}>{BRAND_NAME.toUpperCase()}</div>
          <div style={{ fontSize: 12, fontStyle: "italic", color: "#142c50" }}>{TAGLINE}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>
            {props.shopAddress}{props.shopPhone ? ` · Phone ${props.shopPhone}` : ""}
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>An Abhiram Group company</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#142c50" }}>{props.title}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Date {props.date}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Printed {todayInIndia()}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 24, marginTop: 10, fontSize: 13 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6 }}>Customer</div>
          <div style={{ fontWeight: 700 }}>{props.customerName}</div>
          {props.customerPhone ? <div>Mobile {props.customerPhone}</div> : null}
          {props.customerAddress ? <div style={{ whiteSpace: "pre-line" }}>{props.customerAddress}</div> : null}
        </div>
        {props.note ? <div style={{ flex: 1, alignSelf: "center", fontWeight: 700, color: "#b45309" }}>{props.note}</div> : null}
      </div>
    </div>
  );
}
