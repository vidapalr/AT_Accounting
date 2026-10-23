
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import {
  createProductCategoryAction,
  seedTextileCategoriesAction,
} from "@/lib/product-category-actions";
import { getActiveDivisionId } from "@/lib/division-context";

type Props = {
  searchParams: Promise<{ result?: string }>;
};

interface Category extends RowDataPacket {
  id: number;
  parent_category_id: number | null;
  category_code: string;
  category_name: string;
  display_order: number;
  status: string;
}


const messages: Record<string, string> = {
  created: "Product category created successfully.",
  initialized: "Default textile categories created.",
  "already-initialized": "Default categories already exist.",
  invalid: "Check the category code, name and display order.",
  duplicate: "A category with this code already exists.",
  "invalid-parent": "Select an active main category.",
  "division-missing": "Abhiram Textiles division was not found.",
  "hierarchy-conflict":
    "An existing category has a conflicting parent. Review the hierarchy.",
  failed: "Unable to save the category. Check server logs.",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  marginTop: 5,
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 20,
  marginTop: 20,
};

const cellStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
};

async function CategoryContent({ searchParams }: Props) {
  const user = await requireAccess("products");
  const DIVISION_ID = await getActiveDivisionId(user);
  const query = await searchParams;

  const [categories] = await db.execute<Category[]>(
    `SELECT
       id,
       parent_category_id,
       category_code,
       category_name,
       display_order,
       status
     FROM acct_product_categories
     WHERE legal_business_id = ?
       AND division_id = ?
     ORDER BY display_order, category_name`,
    [user.legal_business_id, DIVISION_ID]
  );

  const parents = categories.filter(
    (category) => category.parent_category_id === null
  );

  const children = categories.filter(
    (category) => category.parent_category_id !== null
  );

  const parentNames = new Map(
    parents.map((parent) => [
      Number(parent.id),
      parent.category_name,
    ])
  );

  return (
    <main style={{
      maxWidth: 1250,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link href="/accounting">
        ← Accounting Dashboard
      </Link>

      <h1>Product Groups</h1>

      <p>
        Manage categories for the Abhiram Textiles
        division. Categories will be shared by the
        central warehouse and all retail branches.
      </p>

      {query.result && (
        <p role="status" style={sectionStyle}>
          {messages[query.result] ?? "Request processed."}
        </p>
      )}

      <section style={sectionStyle}>
        <h2>Initialize Textile Categories</h2>

        <p>
          Create Cotton Sets, Tops, Leggings,
          Nighties and Sarees, including their
          standard subcategories.
        </p>

        <form action={seedTextileCategoriesAction}>
          <button
            type="submit"
            style={{ padding: "10px 18px" }}
          >
            Create Default Categories
          </button>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2>Add Product Category</h2>

        <form
          action={createProductCategoryAction}
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 16,
          }}
        >

          <label>
            Category Name
            <input
              name="category_name"
              required
              maxLength={120}
              placeholder="Silk Sarees"
              style={inputStyle}
            />
          </label>

          <label>
            Parent Category
            <select
              name="parent_category_id"
              defaultValue=""
              style={inputStyle}
            >
              <option value="">
                None — Main Category
              </option>

              {parents
                .filter((p) => p.status === "ACTIVE")
                .map((parent) => (
                  <option
                    key={parent.id}
                    value={parent.id}
                  >
                    {parent.category_name}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Display Order
            <input
              name="display_order"
              type="number"
              min={0}
              max={1000000}
              defaultValue={100}
              style={inputStyle}
            />
          </label>

          <div style={{
            gridColumn: "1 / -1",
          }}>
            <button
              type="submit"
              style={{ padding: "11px 20px" }}
            >
              Save Category
            </button>
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2>Category Hierarchy</h2>

        {parents.length === 0 ? (
          <p>
            No product categories available.
            Initialize the default categories
            to get started.
          </p>
        ) : (
          <div style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns:
              "repeat(auto-fit, minmax(240px, 1fr))",
          }}>
            {parents.map((parent) => (
              <div
                key={parent.id}
                style={{
                  padding: 15,
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {parent.category_name}
                </h3>

                <p style={{ fontSize: 13 }}>
                  {parent.category_code}
                  {" · "}
                  {parent.status}
                </p>

                <ul>
                  {children
                    .filter(
                      (child) =>
                        Number(child.parent_category_id) ===
                        Number(parent.id)
                    )
                    .map((child) => (
                      <li key={child.id}>
                        {child.category_name}
                        {" — "}
                        {child.status}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2>All Product Categories</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "Code",
                  "Category",
                  "Parent",
                  "Level",
                  "Status",
                ].map((heading) => (
                  <th key={heading} style={cellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td style={cellStyle}>
                    {category.category_code}
                  </td>

                  <td style={cellStyle}>
                    {category.category_name}
                  </td>

                  <td style={cellStyle}>
                    {category.parent_category_id === null
                      ? "—"
                      : parentNames.get(
                          Number(category.parent_category_id)
                        ) ?? "Unknown"}
                  </td>

                  <td style={cellStyle}>
                    {category.parent_category_id === null
                      ? "Main"
                      : "Subcategory"}
                  </td>

                  <td style={cellStyle}>
                    {category.status}
                  </td>
                </tr>
              ))}

              {categories.length === 0 && (
                <tr>
                  <td colSpan={5} style={cellStyle}>
                    No categories created yet.
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

export default function ProductCategoriesPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          Loading product categories…
        </main>
      }
    >
      <CategoryContent {...props} />
    </Suspense>
  );
}
