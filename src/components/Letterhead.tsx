import { getBrand } from "@/lib/brand";

/**
 * The company letterhead on printed vouchers and staff letters: logo, group and shop name, address,
 * phone, email and website, all from the brand settings. One place, so every printed paper matches.
 */
export default async function Letterhead({ address, right }: { address?: string; right?: React.ReactNode }) {
  const brand = await getBrand();
  const contact = [brand.shopPhone ? `Phone ${brand.shopPhone}` : "", brand.email].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: "2px solid #142c50", paddingBottom: 12 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoPrint} alt={brand.groupName} width={72} height={72} />
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#142c50" }}>{brand.groupName.toUpperCase()}</div>
          {brand.shopName !== brand.groupName ? <div style={{ fontSize: 14, fontWeight: 700, color: "#142c50" }}>{brand.shopName}</div> : null}
          {address ? <div style={{ fontSize: 12, color: "#475569" }}>{address}</div> : null}
          {contact ? <div style={{ fontSize: 12, color: "#475569" }}>{contact}</div> : null}
          {brand.websites ? <div style={{ fontSize: 12, color: "#475569" }}>{brand.websites}</div> : null}
        </div>
      </div>
      {right ? <div style={{ textAlign: "right", fontWeight: 800, color: "#142c50", fontSize: 16 }}>{right}</div> : null}
    </div>
  );
}
