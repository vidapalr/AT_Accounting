
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

type ReportRow = RowDataPacket & {
  variant_id: number;
  product_name: string;
  sku: string;
  unit_of_measure: string;
  purchased_qty: string;
  sold_qty: string;
  purchase_amount: string;
  sold_amount: string;
  cost_of_goods_sold: string | null;
  unvalued_sales: number;
  remaining_stock: string;
  remaining_stock_amount: string;
};

function money(value: string | number): string {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function qty(value: string | number): string {
  return Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
  textAlign: "right",
};

async function ProductProfitabilityContent() {
  const user = await requireAccess("reports");
  const businessId = user.legal_business_id;

  const [rows] = await db.execute<ReportRow[]>(
    `WITH
     purchases AS (
       SELECT
         legal_business_id,
         division_id,
         variant_id,
         SUM(quantity_change) AS purchased_qty,
         SUM(total_cost) AS purchase_amount
       FROM acct_stock_movements
       WHERE legal_business_id = ?
         AND movement_type = 'PURCHASE_RECEIPT'
       GROUP BY
         legal_business_id, division_id, variant_id
     ),

     invoice_lines AS (
       SELECT
         sl.legal_business_id,
         sl.division_id,
         sl.variant_id,
         sl.quantity,
         sl.line_total,
         sl.total_cost,
         s.grand_total,
         SUM(sl.line_total) OVER (
           PARTITION BY s.id
         ) AS invoice_line_sum
       FROM acct_sales_lines sl
       JOIN acct_sales_headers s
         ON s.legal_business_id = sl.legal_business_id
        AND s.division_id = sl.division_id
        AND s.id = sl.sale_id
       WHERE s.legal_business_id = ?
         AND s.status = 'POSTED'
     ),

     sales AS (
       SELECT
         legal_business_id,
         division_id,
         variant_id,
         SUM(quantity) AS sold_qty,
         SUM(
           CASE
             WHEN invoice_line_sum > 0 THEN
               ROUND(
                 line_total * grand_total /
                 invoice_line_sum,
                 2
               )
             ELSE 0
           END
         ) AS sold_amount,
         SUM(total_cost) AS cost_of_goods_sold,
         SUM(
           CASE
             WHEN total_cost IS NULL
             THEN 1 ELSE 0
           END
         ) AS unvalued_sales
       FROM invoice_lines
       GROUP BY
         legal_business_id, division_id, variant_id
     ),

     inventory AS (
       SELECT
         legal_business_id,
         division_id,
         variant_id,
         SUM(quantity_change) AS remaining_stock,
         SUM(
           CASE
             WHEN quantity_change > 0
               THEN total_cost
             ELSE -total_cost
           END
         ) AS remaining_stock_amount
       FROM acct_stock_movements
       WHERE legal_business_id = ?
       GROUP BY
         legal_business_id, division_id, variant_id
     )

     SELECT
       v.id AS variant_id,
       p.product_name,
       v.sku,
       v.unit_of_measure,

       COALESCE(pur.purchased_qty, 0)
         AS purchased_qty,
       COALESCE(sal.sold_qty, 0)
         AS sold_qty,
       COALESCE(pur.purchase_amount, 0)
         AS purchase_amount,
       COALESCE(sal.sold_amount, 0)
         AS sold_amount,

       sal.cost_of_goods_sold,
       COALESCE(sal.unvalued_sales, 0)
         AS unvalued_sales,

       COALESCE(inv.remaining_stock, 0)
         AS remaining_stock,
       COALESCE(inv.remaining_stock_amount, 0)
         AS remaining_stock_amount

     FROM acct_product_variants v

     JOIN acct_products p
       ON p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id
      AND p.id = v.product_id

     LEFT JOIN purchases pur
       ON pur.legal_business_id = v.legal_business_id
      AND pur.division_id = v.division_id
      AND pur.variant_id = v.id

     LEFT JOIN sales sal
       ON sal.legal_business_id = v.legal_business_id
      AND sal.division_id = v.division_id
      AND sal.variant_id = v.id

     LEFT JOIN inventory inv
       ON inv.legal_business_id = v.legal_business_id
      AND inv.division_id = v.division_id
      AND inv.variant_id = v.id

     WHERE v.legal_business_id = ?

     ORDER BY p.product_name, v.sku`,
    [businessId, businessId, businessId, businessId]
  );

  const valued = rows.filter(
    r =>
      Number(r.unvalued_sales) === 0 &&
      (
        Number(r.sold_qty) === 0 ||
        r.cost_of_goods_sold !== null
      )
  );

  const totalRevenue = rows.reduce(
    (sum, r) => sum + Number(r.sold_amount), 0
  );

  const totalCogs = valued.reduce(
    (sum, r) =>
      sum + Number(r.cost_of_goods_sold ?? 0),
    0
  );

  const hasIncompleteCosts =
    valued.length !== rows.length;

  const totalStockValue = rows.reduce(
    (sum, r) =>
      sum + Number(r.remaining_stock_amount),
    0
  );

  return (
    <main style={{
      padding: 24,
      maxWidth: 1600,
      margin: "0 auto",
    }}>
      <h1>Product Profitability & Stock Report</h1>

      <p>
        Product-wise sales,
        purchase costs, gross margins and
        remaining inventory.
      </p>

      <nav style={{
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        marginBottom: 24,
      }}>
        <Link href="/accounting/invoices">
          Invoices
        </Link>
        <Link href="/accounting/stock">
          Stock on hand
        </Link>
      </nav>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 12,
        marginBottom: 28,
      }}>
        {[
          ["Net Sales", `₹${money(totalRevenue)}`],
          [
            "Cost of Goods Sold",
            hasIncompleteCosts
              ? "Incomplete"
              : `₹${money(totalCogs)}`,
          ],
          [
            "Gross Profit",
            hasIncompleteCosts
              ? "Incomplete"
              : `₹${money(totalRevenue - totalCogs)}`,
          ],
          [
            "Remaining Stock Value",
            `₹${money(totalStockValue)}`,
          ],
        ].map(([label, value]) => (
          <div key={label} style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 18,
          }}>
            <div style={{ color: "#64748b" }}>
              {label}
            </div>
            <strong style={{ fontSize: 22 }}>
              {value}
            </strong>
          </div>
        ))}
      </div>

      {hasIncompleteCosts && (
        <p role="alert" style={{ color: "#b45309" }}>
          Some posted sales do not have recorded
          cost of goods sold. Their profit cannot
          be calculated reliably yet.
        </p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}>
          <thead>
            <tr>
              {[
                "Product",
                "SKU",
                "Unit",
                "Stock Purchased",
                "Stock Sold",
                "Purchase Amt",
                "Sold Amount",
                "COGS",
                "Profit",
                "Profit %",
                "Remaining Stock",
                "Remaining Stock Amt",
              ].map(heading => (
                <th key={heading} style={cell}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map(r => {
              const sold = Number(r.sold_amount);
              const cogs = Number(
                r.cost_of_goods_sold ?? 0
              );

              const complete =
                Number(r.unvalued_sales) === 0 &&
                (
                  Number(r.sold_qty) === 0 ||
                  r.cost_of_goods_sold !== null
                );

              const profit = sold - cogs;
              const profitPct = sold > 0
                ? (profit / sold) * 100
                : null;

              return (
                <tr key={r.variant_id}>
                  <td style={{
                    ...cell,
                    textAlign: "left",
                  }}>
                    {r.product_name}
                  </td>

                  <td style={{
                    ...cell,
                    textAlign: "left",
                  }}>
                    {r.sku}
                  </td>

                  <td style={cell}>
                    {r.unit_of_measure}
                  </td>

                  <td style={cell}>
                    {qty(r.purchased_qty)}
                  </td>

                  <td style={cell}>
                    {qty(r.sold_qty)}
                  </td>

                  <td style={cell}>
                    ₹{money(r.purchase_amount)}
                  </td>

                  <td style={cell}>
                    ₹{money(sold)}
                  </td>

                  <td style={cell}>
                    {complete
                      ? `₹${money(cogs)}`
                      : "Not valued"}
                  </td>

                  <td style={cell}>
                    {complete
                      ? `₹${money(profit)}`
                      : "—"}
                  </td>

                  <td style={cell}>
                    {complete && profitPct !== null
                      ? `${profitPct.toFixed(2)}%`
                      : "—"}
                  </td>

                  <td style={cell}>
                    {qty(r.remaining_stock)}
                  </td>

                  <td style={cell}>
                    ₹{money(r.remaining_stock_amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{
        marginTop: 18,
        fontSize: 12,
        color: "#64748b",
      }}>
        Purchase quantities come from purchase receipt
        movements. Sales use current lines on POSTED
        invoices. Remaining stock and its valuation
        come from the signed stock-movement ledger
        across all locations. Results require
        reconciliation of historical invoice edits,
        returns and stock valuation adjustments.
      </p>
    </main>
  );
}

export default function ProductProfitabilityPage() {
  return (
    <Suspense fallback={
      <p>Loading product profitability...</p>
    }>
      <ProductProfitabilityContent />
    </Suspense>
  );
}
