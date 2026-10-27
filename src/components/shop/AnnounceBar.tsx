import Link from "next/link";

import { loadOffers } from "@/lib/shop";
import styles from "@/app/shop/shop.module.css";

/** A thin bar above the header naming the online offers that are running today. */
export default async function AnnounceBar() {
  const offers = await loadOffers().catch(() => []); // reads the request first, so the date below is safe
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const live = offers.filter(
    (o) => o.channel !== "STORE" && (!o.startsOn || today >= o.startsOn) && (!o.endsOn || today <= o.endsOn)
  );
  if (live.length === 0) return null;
  const o = live[0];
  return (
    <div className={styles.announce}>
      {o.name} on the website{o.endsOn ? ` until ${new Date(`${o.endsOn}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}.{" "}
      <Link href="/shop#products">See what is on offer</Link>
    </div>
  );
}
