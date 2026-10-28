import { WATERMARK_TEXT } from "@/lib/brand";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="240"><text x="210" y="120" text-anchor="middle" transform="rotate(-28 210 120)" font-family="Georgia, serif" font-size="20" fill="#142c50" fill-opacity="0.07">${WATERMARK_TEXT}</text></svg>`;

/** A faint repeated brand mark behind a bill. It also prints (and repeats on every printed page). */
export default function BillWatermark() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
        backgroundRepeat: "repeat",
        printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
      } as React.CSSProperties}
    />
  );
}
