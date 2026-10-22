/**
 * Simple server-rendered SVG bar chart. Handles negative values.
 * Values are plain numbers (rupees); labels are shown under every few bars.
 */
type Point = { label: string; value: number };

const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export default function BarChart({
  title,
  points,
  color = "#2563eb",
  height = 180,
}: {
  title: string;
  points: Point[];
  color?: string;
  height?: number;
}) {
  const width = 640;
  const pad = { top: 12, right: 8, bottom: 26, left: 8 };
  const max = Math.max(0, ...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const innerH = height - pad.top - pad.bottom;
  const innerW = width - pad.left - pad.right;
  const barW = innerW / Math.max(points.length, 1);
  const zeroY = pad.top + (max / span) * innerH;
  const every = Math.ceil(points.length / 8);
  const empty = points.every((p) => p.value === 0);

  return (
    <figure style={{ margin: 0 }}>
      <figcaption style={{ fontWeight: 600, marginBottom: 6 }}>{title}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}. ${empty ? "No data yet." : `Highest ${nf.format(max)}, lowest ${nf.format(min)}.`}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <line x1={pad.left} x2={width - pad.right} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeWidth={1} />
        {points.map((p, i) => {
          const h = (Math.abs(p.value) / span) * innerH;
          const x = pad.left + i * barW + barW * 0.15;
          const y = p.value >= 0 ? zeroY - h : zeroY;
          return (
            <g key={p.label}>
              <rect
                x={x}
                y={y}
                width={barW * 0.7}
                height={Math.max(h, p.value === 0 ? 0 : 1)}
                fill={p.value >= 0 ? color : "#dc2626"}
                rx={2}
              >
                <title>{`${p.label}: ₹${nf.format(p.value)}`}</title>
              </rect>
              {i % every === 0 && (
                <text x={x + barW * 0.35} y={height - 8} fontSize={10} textAnchor="middle" fill="#64748b">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        {empty && (
          <text x={width / 2} y={height / 2} textAnchor="middle" fill="#64748b" fontSize={13}>
            No postings in this period yet
          </text>
        )}
      </svg>
    </figure>
  );
}
