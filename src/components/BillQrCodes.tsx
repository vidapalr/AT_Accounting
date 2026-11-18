import QRCode from "qrcode";

import { billLinks, type Brand } from "@/lib/brand-core";

/** QR codes at the foot of a bill: shop location, Instagram, Facebook, YouTube (only those set on the Brand page). */
export default async function BillQrCodes({ brand }: { brand: Brand }) {
  const links = billLinks(brand);
  if (links.length === 0) return null;
  const codes = await Promise.all(links.map(async (l) => ({ ...l, src: await QRCode.toDataURL(l.url, { margin: 1, width: 160 }) })));
  return (
    <section style={{ marginTop: 18, display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center", breakInside: "avoid" }} aria-label="Scan to find us">
      {codes.map((c) => (
        <figure key={c.label} style={{ margin: 0, textAlign: "center", fontSize: 12, color: "#334155" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.src} alt={`QR code: ${c.label}`} width={96} height={96} />
          <figcaption>{c.label}</figcaption>
        </figure>
      ))}
    </section>
  );
}
