
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import {
  createProductAction,
  createProductVariantAction,
} from "@/lib/product-master-actions";
import { getActiveDivisionId } from "@/lib/division-context";

type Props = {
  searchParams: Promise<{ result?: string }>;
};

interface Category extends RowDataPacket {
  id: number;
  category_name: string;
  parent_name: string | null;
}

interface Product extends RowDataPacket {
  id: number;
  product_code: string;
  product_name: string;
  category_name: string;
  brand_name: string | null;
  fabric: string | null;
  design_name: string | null;
  status: string;
  variant_count: number;
}

interface Variant extends RowDataPacket {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  barcode: string | null;
  size_label: string | null;
  color_name: string | null;
  design_code: string | null;
  unit_of_measure: string;
  status: string;
}


const messages: Record<string, string> = {
  "product-created": "Product created successfully.",
  "variant-created": "Product SKU created successfully.",
  "invalid-product": "Check the selected product or product details.",
  "invalid-category": "Select an active product category.",
  "duplicate-product": "This product code already exists.",
  "invalid-variant": "Check the SKU, size, color and unit.",
  "duplicate-sku": "SKU or barcode already exists.",
  failed: "Unable to save. Check application server logs.",
};

const fieldStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  marginTop: 5,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 20,
  marginTop: 20,
};

const cellStyle: React.CSSProperties = {
  padding: 10,
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 16,
};

async function ProductMasterContent({
  searchParams,
}: Props) {
  const user = await requireAccess("products");
  const DIVISION_ID = await getActiveDivisionId(user);
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const [categories] = await db.execute<Category[]>(
    `SELECT
       c.id,
       c.category_name,
       p.category_name AS parent_name
     FROM acct_product_categories c
     LEFT JOIN acct_product_categories p
       ON p.id = c.parent_category_id
      AND p.legal_business_id = c.legal_business_id
      AND p.division_id = c.division_id
     WHERE c.legal_business_id = ?
       AND c.division_id = ?
       AND c.status = 'ACTIVE'
     ORDER BY
       COALESCE(p.display_order, c.display_order),
       c.display_order,
       c.category_name`,
    [businessId, DIVISION_ID]
  );

  const [products] = await db.execute<Product[]>(
    `SELECT
       p.id,
       p.product_code,
       p.product_name,
       c.category_name,
       p.brand_name,
       p.fabric,
       p.design_name,
       p.status,
       COUNT(v.id) AS variant_count
     FROM acct_products p
     JOIN acct_product_categories c
       ON c.id = p.category_id
      AND c.division_id = p.division_id
      AND c.legal_business_id = p.legal_business_id
     LEFT JOIN acct_product_variants v
       ON v.product_id = p.id
      AND v.division_id = p.division_id
      AND v.legal_business_id = p.legal_business_id
     WHERE p.legal_business_id = ?
       AND p.division_id = ?
     GROUP BY
       p.id,
       p.product_code,
       p.product_name,
       c.category_name,
       p.brand_name,
       p.fabric,
       p.design_name,
       p.status
     ORDER BY p.id DESC`,
    [businessId, DIVISION_ID]
  );

  const [variants] = await db.execute<Variant[]>(
    `SELECT
       v.id,
       v.product_id,
       p.product_code,
       p.product_name,
       v.sku,
       v.barcode,
       v.size_label,
       v.color_name,
       v.design_code,
       v.unit_of_measure,
       v.status
     FROM acct_product_variants v
     JOIN acct_products p
       ON p.id = v.product_id
      AND p.division_id = v.division_id
      AND p.legal_business_id = v.legal_business_id
     WHERE v.legal_business_id = ?
       AND v.division_id = ?
     ORDER BY v.id DESC`,
    [businessId, DIVISION_ID]
  );

  return (
    <main style={{
      maxWidth: 1450,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link href="/accounting/product-categories">
        ← Product Categories
      </Link>

      <h1>Products</h1>

      <p>
        Register products and sellable SKUs shared
        across the central warehouse and retail branches.
      </p>

      {query.result && (
        <p role="status" style={sectionStyle}>
          {messages[query.result] ?? "Request processed."}
        </p>
      )}

      <section style={sectionStyle}>
        <h2>1. Add Product</h2>

        <form
          action={createProductAction}
          style={gridStyle}
        >
          <label>
            Product Category
            <select
              name="category_id"
              required
              defaultValue=""
              style={fieldStyle}
            >
              <option value="">Select Category</option>

              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_name
                    ? `${c.parent_name} → ${c.category_name}`
                    : c.category_name}
                </option>
              ))}
            </select>
          </label>


          <label>
            Product Name
            <input
              name="product_name"
              required
              maxLength={180}
              placeholder="Kalamkari 3-Piece Cotton Set"
              style={fieldStyle}
            />
          </label>

          <label>
            Brand / Manufacturer
            <input
              name="brand_name"
              maxLength={120}
              placeholder="Optional"
              style={fieldStyle}
            />
          </label>

          <label>
            Fabric
            <input
              name="fabric"
              maxLength={100}
              placeholder="Cotton"
              style={fieldStyle}
            />
          </label>

          <label>
            Design Name
            <input
              name="design_name"
              maxLength={120}
              placeholder="Floral Kalamkari"
              style={fieldStyle}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Description
            <textarea
              name="description"
              maxLength={500}
              rows={3}
              style={fieldStyle}
              placeholder="Additional product details"
            />
          </label>

          <div style={{ gridColumn: "1 / -1" }}>
            <button
              type="submit"
              style={{ padding: "12px 20px" }}
            >
              Save Product
            </button>
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2>2. Add Product Variant / SKU</h2>

        <p>
          Add one SKU for each separately tracked
          size, color or design combination.
          For grouped products, create one SKU
          representing the interchangeable items.
        </p>

        <form
          action={createProductVariantAction}
          style={gridStyle}
        >
          <label>
            Select Product
            <select
              name="product_id"
              required
              defaultValue=""
              style={fieldStyle}
            >
              <option value="">Select Product</option>
              {products
                .filter((p) => p.status === "ACTIVE")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_code} — {p.product_name}
                  </option>
                ))}
            </select>
          </label>



          <label>
            Size
            <input
              name="size_label"
              maxLength={40}
              placeholder="M / L / XL / FREE"
              style={fieldStyle}
            />
          </label>

          <label>
            Color
            <input
              name="color_name"
              maxLength={80}
              placeholder="Blue"
              style={fieldStyle}
            />
          </label>

          <label>
            Design Code (optional, made automatically if empty)
            <input
              name="design_code"
              maxLength={80}
              placeholder="KL-001"
              style={fieldStyle}
            />
          </label>

          <label>
            Unit of Measure
            <select
              name="unit_of_measure"
              defaultValue="PCS"
              required
              style={fieldStyle}
            >
              <option value="PCS">Piece</option>
              <option value="SET">Set</option>
              <option value="METER">Meter</option>
            </select>
          </label>

          <div style={{ gridColumn: "1 / -1" }}>
            <button
              type="submit"
              style={{ padding: "12px 20px" }}
            >
              Save SKU
            </button>
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2>Product Catalogue ({products.length})</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "Product Code",
                  "Product",
                  "Category",
                  "Fabric",
                  "Design",
                  "SKUs",
                  "Status",
                ].map((heading) => (
                  <th key={heading} style={cellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td style={cellStyle}>
                    {p.product_code}
                  </td>
                  <td style={cellStyle}>
                    {p.product_name}
                  </td>
                  <td style={cellStyle}>
                    {p.category_name}
                  </td>
                  <td style={cellStyle}>
                    {p.fabric ?? "—"}
                  </td>
                  <td style={cellStyle}>
                    {p.design_name ?? "—"}
                  </td>
                  <td style={cellStyle}>
                    {p.variant_count}
                  </td>
                  <td style={cellStyle}>
                    {p.status}
                  </td>
                </tr>
              ))}

              {products.length === 0 && (
                <tr>
                  <td colSpan={7} style={cellStyle}>
                    No products created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2>Registered SKUs ({variants.length})</h2>

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
                  "Size",
                  "Color",
                  "Design Code",
                  "Barcode",
                  "Unit",
                  "Status",
                ].map((heading) => (
                  <th key={heading} style={cellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {variants.map((v) => (
                <tr key={v.id}>
                  <td style={cellStyle}>
                    <strong>{v.sku}</strong>
                  </td>
                  <td style={cellStyle}>
                    {v.product_name}
                  </td>
                  <td style={cellStyle}>
                    {v.size_label ?? "—"}
                  </td>
                  <td style={cellStyle}>
                    {v.color_name ?? "—"}
                  </td>
                  <td style={cellStyle}>
                    {v.design_code ?? "—"}
                  </td>
                  <td style={cellStyle}>
                    {v.barcode ?? "—"}
                  </td>
                  <td style={cellStyle}>
                    {v.unit_of_measure}
                  </td>
                  <td style={cellStyle}>
                    {v.status}
                  </td>
                </tr>
              ))}

              {variants.length === 0 && (
                <tr>
                  <td colSpan={8} style={cellStyle}>
                    No SKUs registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function ProductMasterPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          Loading Product Master…
        </main>
      }
    >
      <ProductMasterContent {...props} />
    </Suspense>
  );
}
