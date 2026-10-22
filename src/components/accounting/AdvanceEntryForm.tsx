
"use client";

import { useState } from "react";
import { createAdvanceAction } from "@/lib/advance-actions";

type Branch = {
  id: number;
  name: string;
};

type Account = {
  id: number;
  label: string;
  ownership: "BUSINESS" | "INVESTOR";
};

type Cash = {
  id: number;
  label: string;
};

type Investor = {
  id: number;
  name: string;
};

type Props = {
  branches: Branch[];
  banks: Account[];
  cash: Cash[];
  investors: Investor[];
  today: string;
};

const field: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

export default function AdvanceEntryForm({
  branches,
  banks,
  cash,
  investors,
  today,
}: Props) {
  const [level, setLevel] = useState("BRANCH");
  const [source, setSource] = useState("BUSINESS_BANK");
  const [method, setMethod] = useState("BANK_TRANSFER");

  const bankSource = [
    "BUSINESS_BANK", "INVESTOR_BANK",
  ].includes(source);

  const cashSource = source === "BUSINESS_CASH";

  const investorCash = source === "INVESTOR_CASH";

  const bankOptions = banks.filter(
    b => b.ownership === (
      source === "INVESTOR_BANK" ? "INVESTOR" : "BUSINESS"
    )
  );

  return (
    <form
      action={createAdvanceAction}
      style={{
        display: "grid",
        gap: 18,
        padding: 20,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
      }}
    >
      <h2>New Advance / Deposit</h2>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
      }}>
        <label>
          Allocation Level
          <select
            name="allocation_level"
            value={level}
            onChange={e => setLevel(e.target.value)}
            style={field}
          >
            <option value="GROUP">Group</option>
            <option value="DIVISION">Division</option>
            <option value="BRANCH">Branch</option>
          </select>
        </label>

        <label>
          Division
          <select
            name="division_id"
            disabled={level === "GROUP"}
            defaultValue="1"
            style={field}
          >
            <option value="1">Abhiram Textiles</option>
          </select>
        </label>

        <label>
          Branch
          <select
            name="branch_id"
            disabled={level !== "BRANCH"}
            required={level === "BRANCH"}
            defaultValue=""
            style={field}
          >
            <option value="">Select branch</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Advance Type
          <select name="advance_type" required style={field}>
            <option value="REFUNDABLE_SHOP_DEPOSIT">
              Refundable Shop Deposit
            </option>
            <option value="SUPPLIER_ADVANCE">
              Supplier Advance
            </option>
            <option value="EMPLOYEE_ADVANCE">
              Employee Advance
            </option>
            <option value="PREPAID_RENT">
              Prepaid Rent
            </option>
            <option value="OTHER">Other Advance</option>
          </select>
        </label>

        <label>
          Advance / Payment Date
          <input
            type="date"
            name="advance_date"
            defaultValue={today}
            required
            style={field}
          />
        </label>

        <label>
          Amount ₹
          <input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            required
            style={field}
          />
        </label>
      </div>

      <label>
        Paid To / Recipient
        <input
          name="recipient_name"
          placeholder="Landlord / Supplier / Employee"
          maxLength={180}
          required
          style={field}
        />
      </label>

      <label>
        Description
        <input
          name="description"
          placeholder="Example: Refundable Kapra shop security deposit"
          maxLength={500}
          required
          style={field}
        />
      </label>

      <fieldset style={{
        display: "grid",
        gap: 12,
        padding: 16,
        border: "1px solid #cbd5e1",
        borderRadius: 8,
      }}>
        <legend>Payment Details</legend>

        <label>
          Paid From
          <select
            name="payment_source"
            value={source}
            onChange={e => {
              setSource(e.target.value);
              setMethod(
                ["BUSINESS_CASH", "INVESTOR_CASH"]
                  .includes(e.target.value)
                  ? "CASH"
                  : "BANK_TRANSFER"
              );
            }}
            style={field}
          >
            <option value="BUSINESS_BANK">Group Bank</option>
            <option value="BUSINESS_CASH">Group / Branch Cash</option>
            <option value="INVESTOR_BANK">Investor Bank</option>
            <option value="INVESTOR_CASH">Investor Cash</option>
            <option value="OWNER_PERSONAL">Owner Personal</option>
          </select>
        </label>

        <label>
          Payment Method
          <select
            name="payment_method"
            value={method}
            onChange={e => setMethod(e.target.value)}
            style={field}
          >
            <option value="CASH">Cash</option>
            {!["BUSINESS_CASH", "INVESTOR_CASH"].includes(source) && (
              <>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </>
            )}
          </select>
        </label>

        {(bankSource || cashSource) && (
          <label>
            Paying Account
            <select
              key={source}
              name="payment_account"
              required
              defaultValue=""
              style={field}
            >
              <option value="">Select account</option>

              {bankSource && bankOptions.map(b => (
                <option
                  key={b.id}
                  value={`BANK:${b.id}`}
                >
                  {b.label}
                </option>
              ))}

              {cashSource && cash.map(c => (
                <option
                  key={c.id}
                  value={`CASH:${c.id}`}
                >
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {investorCash && (
          <label>
            Investor
            <select
              name="funding_party_id"
              required
              defaultValue=""
              style={field}
            >
              <option value="">Select investor</option>
              {investors.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Payment Reference (Optional)
          <input
            name="payment_reference"
            maxLength={150}
            style={field}
          />
        </label>
      </fieldset>

      <label>
        Remarks (Optional)
        <textarea
          name="remarks"
          rows={2}
          maxLength={500}
          style={field}
        />
      </label>

      <button
        type="submit"
        style={{ padding: "12px 20px" }}
      >
        Save Advance & Payment
      </button>
    </form>
  );
}
