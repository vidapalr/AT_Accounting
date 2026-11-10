"use client";

import { useState } from "react";

export type PaidFromOption = {
  key: string;
  label: string;
  source: "BUSINESS_BANK" | "BUSINESS_CASH" | "INVESTOR_BANK" | "INVESTOR_CASH" | "OWNER_PERSONAL";
  bankId?: number;
  cashId?: number;
  partyId?: number;
  /** An owner account: the owner's own money, tracked against that account. */
  ownerAccountId?: number;
  ownerAccountName?: string;
};
export type AgreementOption = { id: number; label: string; partyId: number };

const input: React.CSSProperties = { display: "block", width: "100%", padding: 12, fontSize: 16, marginTop: 6, border: "1px solid #cbd5e1", borderRadius: 6 };

/** One "Paid from" list. It fills in the hidden fields the payment form needs. */
export default function PaidFromPicker({ options, agreements }: { options: PaidFromOption[]; agreements: AgreementOption[] }) {
  const [key, setKey] = useState("");
  const chosen = options.find((o) => o.key === key);
  const isInvestor = chosen?.source === "INVESTOR_BANK" || chosen?.source === "INVESTOR_CASH";
  const theirAgreements = agreements.filter((a) => a.partyId === chosen?.partyId);

  return (
    <div>
      <label>
        Paid from
        <select value={key} onChange={(e) => setKey(e.target.value)} required style={input}>
          <option value="">Choose where the money came from</option>
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </label>
      <input type="hidden" name="payment_source" value={chosen?.source ?? ""} />
      <input type="hidden" name="source_bank_account_id" value={chosen?.bankId ?? ""} />
      <input type="hidden" name="source_cash_account_id" value={chosen?.cashId ?? ""} />
      <input type="hidden" name="funding_party_id" value={chosen?.partyId ?? ""} />
      <input type="hidden" name="owner_account_id" value={chosen?.ownerAccountId ?? ""} />
      {chosen?.ownerAccountId && <input type="hidden" name="payer_name" value={chosen.ownerAccountName ?? "Owner"} />}
      {isInvestor && (
        <label style={{ display: "block", marginTop: 12 }}>
          Investor agreement (optional)
          <select name="funding_agreement_id" defaultValue="" style={input}>
            <option value="">None: treat as a temporary advance</option>
            {theirAgreements.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
      )}
      {chosen?.source === "OWNER_PERSONAL" && !chosen.ownerAccountId && (
        <label style={{ display: "block", marginTop: 12 }}>
          Who paid (name)
          <input name="payer_name" required minLength={2} maxLength={160} style={input} />
        </label>
      )}
    </div>
  );
}
