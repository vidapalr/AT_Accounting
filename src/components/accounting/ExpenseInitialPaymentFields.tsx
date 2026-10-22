
"use client";

import { useState } from "react";

type Bank = {
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
  banks: Bank[];
  cashAccounts: Cash[];
  investors: Investor[];
  today: string;
};

export default function ExpenseInitialPaymentFields({
  banks,
  cashAccounts,
  investors,
  today,
}: Props) {
  const [source, setSource] = useState("UNPAID");
  const [method, setMethod] = useState("BANK_TRANSFER");

  const isBank =
    source === "BUSINESS_BANK" || source === "INVESTOR_BANK";

  const isCash = source === "BUSINESS_CASH";
  const isInvestorCash = source === "INVESTOR_CASH";
  const paid = source !== "UNPAID";

  const availableBanks = banks.filter(
    b => b.ownership === (
      source === "INVESTOR_BANK" ? "INVESTOR" : "BUSINESS"
    )
  );

  return (
    <fieldset style={{
      border: "1px solid #cbd5e1",
      padding: 16,
      borderRadius: 8,
      display: "grid",
      gap: 12,
    }}>
      <legend><strong>Payment Details</strong></legend>

      <p>
        Select the actual account paying this expense.
        Leave it unpaid if payment has not been made.
      </p>

      <label>
        Paid From
        <select
          name="initial_payment_source"
          value={source}
          onChange={e => {
            const value = e.target.value;
            setSource(value);
            setMethod(
              ["BUSINESS_CASH", "INVESTOR_CASH"].includes(value)
                ? "CASH"
                : "BANK_TRANSFER"
            );
          }}
        >
          <option value="UNPAID">Unpaid / Pay Later</option>
          <option value="BUSINESS_BANK">Group Bank</option>
          <option value="BUSINESS_CASH">Group / Branch Cash</option>
          <option value="INVESTOR_BANK">Investor Bank</option>
          <option value="INVESTOR_CASH">Investor Cash</option>
          <option value="OWNER_PERSONAL">Owner Personal Funds</option>
        </select>
      </label>

      {paid && (
        <>
          <label>
            Payment Date
            <input
              type="date"
              name="initial_payment_date"
              defaultValue={today}
              required
            />
          </label>

          <label>
            Payment Method
            <select
              name="initial_payment_method"
              value={method}
              onChange={e => setMethod(e.target.value)}
            >
              <option value="CASH">Cash</option>
              {!isCash && !isInvestorCash && (
                <>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CARD">Card</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </>
              )}
            </select>
          </label>

          {(isBank || isCash) && (
            <label>
              Paying Account
              <select
                key={source}
                name="initial_payment_account"
                required
                defaultValue=""
              >
                <option value="">Select account</option>
                {isBank && availableBanks.map(b => (
                  <option key={b.id} value={`BANK:${b.id}`}>
                    {b.label}
                  </option>
                ))}
                {isCash && cashAccounts.map(c => (
                  <option key={c.id} value={`CASH:${c.id}`}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isInvestorCash && (
            <label>
              Investor
              <select
                name="initial_funding_party_id"
                required
                defaultValue=""
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
            Amount Paid ₹
            <input
              type="number"
              name="initial_paid_amount"
              min="0.01"
              step="0.01"
              required
            />
          </label>

          <label>
            Payment Reference (optional)
            <input
              name="initial_payment_reference"
              maxLength={150}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
