
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import {
  postGoodsReceiptAction,
} from "@/lib/goods-receipt-actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
};

interface Header extends RowDataPacket {
  id: number;
  purchase_no: string;
  supplier_name: string;
  supplier_invoice_no: string | null;
  invoice_date: string;
  received_date: string | null;
  location_name: string;
  location_code: string;
  status: string;
  remarks: string | null;
  posted_at: string | null;
}

interface Line extends RowDataPacket {
  id: number;
  line_no: number;
  sku: string;
  product_name: string;
  size_label: string | null;
  color_name: string | null;
  quantity: string;
  unit_cost: string;
  line_amount: string;
  unit_of_measure: string;
}

const card: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 20,
  marginTop: 20,
};

const cell: React.CSSProperties = {
  padding: 11,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
};

const messages: Record<string, string> = {
  posted: "Goods receipt posted successfully. Warehouse stock updated.",
  invalid: "Select a valid received date and confirm receipt.",
  "not-found": "Purchase was not found.",
  "not-draft": "Only draft purchases can be posted.",
  "master-invalid": "Supplier or central warehouse is not active.",
  "date-invalid": "Received date cannot be earlier than invoice date.",
  "already-received": "Stock movements already exist for this purchase.",
  "lines-invalid": "Purchase lines or purchase costs failed validation.",
  "posting-conflict": "Purchase posting could not be completed.",
  failed: "Posting failed. Review server logs.",
};

function amountToPaise(value: string): bigint {
  const [whole, decimals = ""] = String(value).split(".");
  return (
    BigInt(whole) * 100n +
    BigInt(decimals.padEnd(2, "0"))
  );
}

function formatMoney(paise: bigint): string {
  return `₹${paise / 100n}.` +
    String(paise % 100n).padStart(2, "0");
}

async function PurchaseDetailContent({
  params,
  searchParams,
}: Props) {
  const user = await requireAccess("purchases");
  const { id } = await params;
  const query = await searchParams;

  if (!/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id))) {
    notFound();
  }

  const purchaseId = Number(id);
  const businessId = user.legal_business_id;

  const [headers] = await db.execute<Header[]>(
    `SELECT
       h.id,
       h.purchase_no,
       s.supplier_name,
       h.supplier_invoice_no,
       DATE_FORMAT(h.invoice_date, '%Y-%m-%d')
         AS invoice_date,
       DATE_FORMAT(h.received_date, '%Y-%m-%d')
         AS received_date,
       w.location_name,
       w.location_code,
       h.status,
       h.remarks,
       DATE_FORMAT(h.posted_at, '%Y-%m-%d %H:%i')
         AS posted_at
     FROM acct_purchase_headers h
     JOIN acct_suppliers s
       ON s.id = h.supplier_id
      AND s.legal_business_id = h.legal_business_id
     JOIN acct_inventory_locations w
       ON w.id = h.receiving_location_id
      AND w.legal_business_id = h.legal_business_id
     WHERE h.id = ?
       AND h.legal_business_id = ?
       AND h.division_id = 1
     LIMIT 1`,
    [purchaseId, businessId]
  );

  const purchase = headers[0];
  if (!purchase) notFound();

  const [lines] = await db.execute<Line[]>(
    `SELECT
       l.id,
       l.line_no,
       v.sku,
       p.product_name,
       v.size_label,
       v.color_name,
       CAST(l.quantity AS CHAR) AS quantity,
       CAST(l.unit_cost AS CHAR) AS unit_cost,
       CAST(l.line_amount AS CHAR) AS line_amount,
       v.unit_of_measure
     FROM acct_purchase_lines l
     JOIN acct_product_variants v
       ON v.id = l.variant_id
      AND v.legal_business_id = l.legal_business_id
      AND v.division_id = l.division_id
     JOIN acct_products p
       ON p.id = v.product_id
      AND p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id
     WHERE l.purchase_id = ?
       AND l.legal_business_id = ?
       AND l.division_id = 1
     ORDER BY l.line_no`,
    [purchaseId, businessId]
  );

  const total = lines.reduce(
    (sum, line) =>
      sum + amountToPaise(line.line_amount),
    0n
  );

  return (
    <main style={{
      maxWidth: 1150,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link href="/accounting/purchases">
        ← Purchase List
      </Link>

      <h1>{purchase.purchase_no}</h1>

      <p>
        Status: <strong>{purchase.status}</strong>
      </p>

      {query.result && (
        <p role="status" style={card}>
          {messages[query.result] ??
            "Request completed."}
        </p>
      )}

      <section style={card}>
        <h2>Purchase Details</h2>

        <table>
          <tbody>
            <tr>
              <td style={cell}>Supplier</td>
              <td style={cell}>{purchase.supplier_name}</td>
            </tr>
            <tr>
              <td style={cell}>Supplier Invoice</td>
              <td style={cell}>
                {purchase.supplier_invoice_no ?? "—"}
              </td>
            </tr>
            <tr>
              <td style={cell}>Invoice Date</td>
              <td style={cell}>{purchase.invoice_date}</td>
            </tr>
            <tr>
              <td style={cell}>Receiving Warehouse</td>
              <td style={cell}>
                {purchase.location_code}
                {" — "}
                {purchase.location_name}
              </td>
            </tr>
            <tr>
              <td style={cell}>Received Date</td>
              <td style={cell}>
                {purchase.received_date ?? "Not received"}
              </td>
            </tr>
            <tr>
              <td style={cell}>Remarks</td>
              <td style={cell}>
                {purchase.remarks ?? "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h2>Purchase Items</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "SKU",
                  "Product",
                  "Quantity",
                  "Unit Cost",
                  "Amount",
                ].map((heading) => (
                  <th key={heading} style={cell}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={cell}>{line.sku}</td>
                  <td style={cell}>
                    {line.product_name}
                    {line.size_label
                      ? ` / ${line.size_label}`
                      : ""}
                    {line.color_name
                      ? ` / ${line.color_name}`
                      : ""}
                  </td>
                  <td style={cell}>
                    {line.quantity}{" "}
                    {line.unit_of_measure}
                  </td>
                  <td style={cell}>
                    ₹{line.unit_cost}
                  </td>
                  <td style={cell}>
                    ₹{line.line_amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          <strong>
            Total Purchase Cost: {formatMoney(total)}
          </strong>
        </p>
      </section>

      <section style={card}>
        <h2>Goods Receipt</h2>

        {purchase.status === "POSTED" ? (
          <>
            <p>
              Goods receipt has been posted.
              The purchase is now read-only.
            </p>
            <p>
              Posted on: {purchase.posted_at ?? "—"}
            </p>
          </>
        ) : purchase.status !== "DRAFT" ? (
          <p>
            This purchase cannot be received because
            its status is {purchase.status}.
          </p>
        ) : (
          <>
            <p>
              Confirm the goods have physically arrived
              at the central warehouse. Posting will
              increase inventory and cannot be repeated.
            </p>

            <form action={postGoodsReceiptAction}>
              <input
                type="hidden"
                name="purchase_id"
                value={purchase.id}
              />

              <label>
                Actual Goods Received Date
                <input
                  type="date"
                  name="received_date"
                  min={purchase.invoice_date}
                  required
                  style={{
                    display: "block",
                    padding: 10,
                    marginTop: 8,
                    marginBottom: 16,
                  }}
                />
              </label>

              <label>
                <input
                  type="checkbox"
                  name="confirm"
                  value="RECEIVE"
                  required
                />
                {" "}
                I confirm that all listed quantities
                were received at the selected warehouse.
              </label>

              <div style={{ marginTop: 20 }}>
                <button
                  type="submit"
                  style={{ padding: "12px 20px" }}
                >
                  Post Goods Receipt
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      <section style={card}>
        <h2>Supplier Payments</h2>

        <p>
          Record payments made by Abhiram Group,
          investors or the owner against this purchase.
        </p>

        <Link
          href={`/accounting/purchases/${purchase.id}/payments`}
        >
          View / Record Purchase Payments →
        </Link>
      </section>
    </main>
  );
}

export default function PurchaseDetailPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          Loading purchase details…
        </main>
      }
    >
      <PurchaseDetailContent {...props} />
    </Suspense>
  );
}
