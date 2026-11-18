import { arcPath, pieSlices, type SliceIn } from "@/lib/reports/pie";

const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Server-rendered pie (donut) with its figures beside it: name, amount and share for every slice, so the
 * split can be read without telling colours apart. At most six slices; smaller parts fold into "Other".
 * Hovering a slice shows its name, amount and share.
 */
export default function PieChart({ title, parts, money = true, note }: { title: string; parts: SliceIn[]; money?: boolean; note?: string }) {
  const slices = pieSlices(parts);
  const total = slices.reduce((t, s) => t + s.value, 0);
  const fmt = (v: number) => (money ? `₹${nf.format(v)}` : nf.format(v));
  const pct = (s: number) => `${(s * 100).toFixed(s < 0.1 ? 1 : 0)}%`;
  let angle = 0;
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <figcaption style={{ fontWeight: 600, marginBottom: 6 }}>{title}</figcaption>
      {slices.length === 0 ? (
        <p style={{ color: "#64748b", margin: 0 }}>Nothing to show for this period.</p>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <svg viewBox="0 0 160 160" width={150} height={150} role="img" aria-label={`${title}: ${slices.map((s) => `${s.label} ${pct(s.share)}`).join(", ")}`} style={{ flex: "0 0 auto" }}>
            {slices.map((s) => {
              const a0 = angle;
              angle += s.share * Math.PI * 2;
              return (
                <path key={s.label} d={arcPath(80, 80, 76, 44, a0, angle)} fill={s.color} stroke="#fcfcfb" strokeWidth={2}>
                  <title>{`${s.label}: ${fmt(s.value)} (${pct(s.share)})`}</title>
                </path>
              );
            })}
            <text x={80} y={76} textAnchor="middle" fontSize={11} fill="#52514e">Total</text>
            <text x={80} y={92} textAnchor="middle" fontSize={13} fontWeight={600} fill="#0b0b0b">{fmt(total)}</text>
          </svg>
          <table style={{ borderCollapse: "collapse", fontSize: 14, flex: "1 1 200px" }}>
            <tbody>
              {slices.map((s) => (
                <tr key={s.label}>
                  <td style={{ padding: "3px 6px 3px 0" }}>
                    <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: s.color, marginRight: 6 }} />
                    {s.label}
                  </td>
                  <td style={{ padding: "3px 6px", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(s.value)}</td>
                  <td style={{ padding: "3px 0", textAlign: "right", color: "#52514e" }}>{pct(s.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {note ? <p style={{ color: "#64748b", fontSize: 13, margin: "6px 0 0" }}>{note}</p> : null}
    </figure>
  );
}
