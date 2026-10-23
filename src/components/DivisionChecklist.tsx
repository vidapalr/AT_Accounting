import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

/**
 * "Is this division ready to trade?" One row per division with the things that
 * must exist before the first sale, each linking to the page that fixes it.
 */
export default async function DivisionChecklist({ businessId }: { businessId: number }) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT d.id, d.name,
            (SELECT COUNT(*) FROM acct_branches b
              WHERE b.legal_business_id = d.legal_business_id AND b.division_id = d.id AND b.status = 'ACTIVE') AS branches,
            (SELECT COUNT(*) FROM acct_inventory_locations l
              WHERE l.legal_business_id = d.legal_business_id AND l.division_id = d.id AND l.status = 'ACTIVE') AS locations,
            (SELECT COUNT(*) FROM acct_cash_accounts c
              WHERE c.legal_business_id = d.legal_business_id AND c.status = 'ACTIVE'
                AND (c.division_id = d.id OR c.division_id IS NULL)) AS cash_accounts,
            (SELECT COUNT(*) FROM acct_product_categories pc
              WHERE pc.legal_business_id = d.legal_business_id AND pc.division_id = d.id) AS categories,
            (SELECT COUNT(*) FROM acct_products p
              WHERE p.legal_business_id = d.legal_business_id AND p.division_id = d.id) AS products
       FROM acct_divisions d
      WHERE d.legal_business_id = ? AND d.status = 'ACTIVE'
      ORDER BY d.id`,
    [businessId]
  );

  const steps = (r: RowDataPacket) => [
    { done: Number(r.branches) > 0, label: "A branch (shop)", href: "/branches", n: r.branches },
    { done: Number(r.locations) > 0, label: "A stock location (warehouse or shop)", href: "/branches", n: r.locations },
    { done: Number(r.cash_accounts) > 0, label: "A cash account", href: "/accounting/cash-accounts", n: r.cash_accounts },
    { done: Number(r.categories) > 0, label: "Product groups", href: "/accounting/product-categories", n: r.categories },
    { done: Number(r.products) > 0, label: "Products", href: "/accounting/products", n: r.products },
  ];

  return (
    <section style={{ marginTop: 24, padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>Is each division ready to trade?</h2>
      <p style={{ color: "#64748b" }}>
        Work down each list. Switch to the division with the &ldquo;Working in&rdquo; box at the top
        before adding product groups and products.
      </p>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {rows.map(r => {
          const list = steps(r);
          const ready = list.every(s => s.done);
          return (
            <div key={String(r.id)} style={{ border: `1px solid ${ready ? "#bbf7d0" : "#fde68a"}`, borderRadius: 10, padding: 14, background: ready ? "#f0fdf4" : "#fffbeb" }}>
              <strong>{String(r.name)}</strong>{" "}
              <span style={{ color: ready ? "#166534" : "#92400e" }}>{ready ? "Ready" : "Not ready yet"}</span>
              <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "grid", gap: 6 }}>
                {list.map(s => (
                  <li key={s.label}>
                    {s.done ? "✔" : "○"}{" "}
                    {s.done ? (
                      <span>{s.label} ({String(s.n)})</span>
                    ) : (
                      <Link href={s.href}>{s.label}: add one</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
