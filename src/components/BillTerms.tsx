import { termsLines } from "@/lib/bill-terms-text";

/** The terms and conditions printed at the foot of every bill and estimate. */
export default function BillTerms({ text }: { text: string }) {
  const lines = termsLines(text);
  if (lines.length === 0) return null;
  return (
    <section style={{ marginTop: 22, paddingTop: 10, borderTop: "1px solid #cbd5e1", fontSize: 12, color: "#334155", breakInside: "avoid" }}>
      <strong style={{ display: "block", marginBottom: 4 }}>Terms and conditions</strong>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ol>
    </section>
  );
}
