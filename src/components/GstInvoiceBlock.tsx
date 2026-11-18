import type { InvoiceGst } from "@/lib/gst/data";
import { inr } from "@/lib/reports/money";
import { cell, muted } from "@/lib/ui/styles";

/** The GST part of a printed bill: tax invoice details and tax by HSN, or the bill-of-supply line for composition. */
export default function GstInvoiceBlock({ gst }: { gst: InvoiceGst | null }) {
  if (!gst) return null;
  if (gst.kind === "BILL_OF_SUPPLY") {
    return (
      <section style={{ margin: "12px 0", padding: 12, border: "1px solid #e2e8f0", borderRadius: 8 }}>
        <strong>Bill of supply</strong> · GSTIN {gst.sellerGstin}
        <p style={{ margin: "4px 0 0" }}>Composition taxable person, not eligible to collect tax on supplies.</p>
      </section>
    );
  }
  const right = { ...cell, textAlign: "right" as const };
  return (
    <section style={{ margin: "12px 0", padding: 12, border: "1px solid #e2e8f0", borderRadius: 8 }}>
      <p style={{ margin: 0 }}>
        <strong>Tax invoice</strong> · Our GSTIN {gst.sellerGstin}
        {gst.buyerGstin ? <> · Customer GSTIN {gst.buyerGstin}</> : null}
        {gst.placeOfSupply ? <> · Place of supply: {gst.placeOfSupply.name} ({gst.placeOfSupply.code})</> : null}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={cell}>HSN</th>
              <th style={right}>GST rate</th>
              <th style={right}>Value before GST</th>
              {gst.interState ? <th style={right}>IGST</th> : <><th style={right}>CGST</th><th style={right}>SGST</th></>}
            </tr>
          </thead>
          <tbody>
            {gst.rows.map((r) => (
              <tr key={`${r.hsn}-${r.rate}`}>
                <td style={cell}>{r.hsn}</td>
                <td style={right}>{r.rate}%</td>
                <td style={right}>{inr(r.taxable)}</td>
                {gst.interState ? <td style={right}>{inr(r.igst)}</td> : <><td style={right}>{inr(r.cgst)}</td><td style={right}>{inr(r.sgst)}</td></>}
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td style={cell} colSpan={2}>Total</td>
              <td style={right}>{inr(gst.total.taxable)}</td>
              {gst.interState ? <td style={right}>{inr(gst.total.igst)}</td> : <><td style={right}>{inr(gst.total.cgst)}</td><td style={right}>{inr(gst.total.sgst)}</td></>}
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ ...muted, margin: "6px 0 0" }}>Prices include GST. GST in this bill: {inr(gst.total.cgst + gst.total.sgst + gst.total.igst)}.</p>
    </section>
  );
}
