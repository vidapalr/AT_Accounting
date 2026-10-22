
"use client";

import { useState, useTransition } from "react";

import {
  quickCreateSupplierAction,
  type QuickSupplierInput,
} from "@/lib/quick-supplier-actions";

type Supplier = {
  id: number;
  supplier_code: string;
  supplier_name: string;
};

type Props = {
  initialSuppliers: Supplier[];
  selectedSupplierId?: string;
};

const emptyInput: QuickSupplierInput = {
  supplierName: "",
  supplierType: "WHOLESALER",
  contactPerson: "",
  mobile: "",
  city: "",
  gstin: "",
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: 10,
  marginTop: 5,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

export default function QuickSupplierSelect({
  initialSuppliers,
  selectedSupplierId = "",
}: Props) {
  const [suppliers, setSuppliers] =
    useState<Supplier[]>(initialSuppliers);

  const [selectedId, setSelectedId] =
    useState(selectedSupplierId);
  const [open, setOpen] = useState(false);
  const [input, setInput] =
    useState<QuickSupplierInput>(emptyInput);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof QuickSupplierInput>(
    key: K,
    value: QuickSupplierInput[K]
  ) {
    setInput((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function close() {
    if (isPending) return;
    setOpen(false);
    setError("");
  }

  function saveSupplier() {
    setError("");

    startTransition(async () => {
      try {
        const result = await quickCreateSupplierAction(input);

        if (!result.ok) {
          setError(result.message);
          return;
        }

        const supplier: Supplier = {
          id: result.supplier.id,
          supplier_code: result.supplier.code,
          supplier_name: result.supplier.name,
        };

        setSuppliers((current) =>
          [...current, supplier].sort((a, b) =>
            a.supplier_name.localeCompare(b.supplier_name)
          )
        );

        setSelectedId(String(supplier.id));
        setInput(emptyInput);
        setOpen(false);
      } catch (error) {
        console.error("Quick supplier save error", error);
        setError("Unable to save supplier. Please retry.");
      }
    });
  }

  return (
    <>
      <div>
        <label htmlFor="purchase-supplier">
          Supplier
        </label>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "end",
            marginTop: 5,
          }}
        >
          <select
            id="purchase-supplier"
            name="supplier_id"
            required
            value={selectedId}
            onChange={(event) =>
              setSelectedId(event.target.value)
            }
            style={{
              ...inputStyle,
              marginTop: 0,
              flex: 1,
              minWidth: 150,
            }}
          >
            <option value="">Select Supplier</option>

            {suppliers.map((supplier) => (
              <option
                key={supplier.id}
                value={supplier.id}
              >
                {supplier.supplier_code} —{" "}
                {supplier.supplier_name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
            style={{
              padding: "10px 12px",
              border: "1px solid #2563eb",
              color: "#2563eb",
              borderRadius: 6,
              whiteSpace: "nowrap",
            }}
          >
            + New Supplier
          </button>
        </div>
      </div>

      {open && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-supplier-title"
            style={{
              width: "100%",
              maxWidth: 550,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "white",
              padding: 24,
              borderRadius: 12,
              boxSizing: "border-box",
              color: "#0f172a",
            }}
          >
            <h2 id="quick-supplier-title">
              Add New Supplier
            </h2>

            <p>
              Create the supplier without leaving
              the current purchase.
            </p>

            {error && (
              <p
                role="alert"
                style={{ color: "#b91c1c" }}
              >
                {error}
              </p>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 14,
              }}
            >
              <label>
                Supplier Name *
                <input
                  value={input.supplierName}
                  maxLength={180}
                  autoFocus
                  onChange={(event) =>
                    update("supplierName", event.target.value)
                  }
                  style={inputStyle}
                  placeholder="Business / supplier name"
                />
              </label>

              <label>
                Supplier Type *
                <select
                  value={input.supplierType}
                  onChange={(event) =>
                    update(
                      "supplierType",
                      event.target.value as
                        QuickSupplierInput["supplierType"]
                    )
                  }
                  style={inputStyle}
                >
                  <option value="MANUFACTURER">
                    Manufacturer
                  </option>
                  <option value="WHOLESALER">
                    Wholesaler
                  </option>
                  <option value="WEAVER">
                    Weaver
                  </option>
                  <option value="DISTRIBUTOR">
                    Distributor
                  </option>
                  <option value="OTHER">
                    Other
                  </option>
                </select>
              </label>

              <label>
                Contact Person
                <input
                  value={input.contactPerson}
                  maxLength={150}
                  onChange={(event) =>
                    update("contactPerson", event.target.value)
                  }
                  style={inputStyle}
                />
              </label>

              <label>
                Mobile Number
                <input
                  value={input.mobile}
                  maxLength={20}
                  inputMode="tel"
                  onChange={(event) =>
                    update("mobile", event.target.value)
                  }
                  style={inputStyle}
                />
              </label>

              <label>
                City
                <input
                  value={input.city}
                  maxLength={100}
                  onChange={(event) =>
                    update("city", event.target.value)
                  }
                  placeholder="Pedana / Hyderabad"
                  style={inputStyle}
                />
              </label>

              <label>
                GSTIN (Optional)
                <input
                  value={input.gstin}
                  maxLength={15}
                  onChange={(event) =>
                    update("gstin", event.target.value)
                  }
                  style={inputStyle}
                />
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 24,
              }}
            >
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                style={{ padding: "10px 16px" }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveSupplier}
                disabled={
                  isPending ||
                  input.supplierName.trim().length < 2
                }
                style={{
                  padding: "10px 16px",
                  background: "#1d4ed8",
                  color: "white",
                  border: 0,
                  borderRadius: 6,
                }}
              >
                {isPending
                  ? "Saving..."
                  : "Save & Select Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
