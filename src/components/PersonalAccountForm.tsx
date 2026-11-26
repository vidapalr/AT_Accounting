"use client";

import { useState } from "react";

import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/ui";
import { fieldFull as field, formGrid } from "@/lib/ui/styles";
import { savePersonalAccountAction } from "@/lib/personal-money-actions";
import { bankFromIfsc } from "@/lib/ifsc";

/** Plain values only (strings), so the server page can hand them to this browser form. */
export type AccountFormValues = {
  id: number; name: string; kind: string; bankName: string; last4: string; note: string;
  limit: string; billDay: string; dueDay: string; amount: string; date: string;
  holder: string; ifsc: string; hasAccountNo: boolean;
};

const KIND_WORDS: Array<[string, string]> = [["BANK", "Bank account"], ["CREDIT_CARD", "Credit card"], ["CASH", "Cash at home"], ["WALLET", "Wallet / UPI"]];

/** Add or change an account; the boxes change with the kind (a bank asks for IFSC and account number, a card for limit and dates). */
export default function PersonalAccountForm({ account, today }: { account?: AccountFormValues; today: string }) {
  const a = account;
  const [kind, setKind] = useState(a?.kind ?? "BANK");
  const [bankName, setBankName] = useState(a?.bankName ?? "");
  const card = kind === "CREDIT_CARD";
  const bank = kind === "BANK";

  return (
    <form action={savePersonalAccountAction} style={formGrid}>
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <Field label="Kind">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} style={field}>
          {KIND_WORDS.map(([k, w]) => <option key={k} value={k}>{w}</option>)}
        </select>
      </Field>
      <Field label="Name">
        <input name="account_name" required maxLength={100} defaultValue={a?.name}
          placeholder={card ? "SBI SimplyClick card" : bank ? "My HDFC savings" : kind === "CASH" ? "Cash at home" : "PhonePe wallet"} style={field} />
      </Field>

      {bank && (
        <>
          <Field label="Account holder name"><input name="account_holder" maxLength={150} defaultValue={a?.holder} style={field} /></Field>
          <Field label="Account number" hint={a?.hasAccountNo ? `Saved (ending ${a.last4}). Leave empty to keep it.` : "Kept locked; only you can show it."}>
            <input name="account_no" inputMode="numeric" autoComplete="off" maxLength={30} placeholder={a?.hasAccountNo ? `•••• ${a.last4}` : ""} style={field} />
          </Field>
          <Field label="IFSC">
            <input name="ifsc" maxLength={11} defaultValue={a?.ifsc} placeholder="SBIN0001234" style={{ ...field, textTransform: "uppercase" }}
              onBlur={(e) => { const b = bankFromIfsc(e.target.value); if (b && !bankName) setBankName(b); }} />
          </Field>
        </>
      )}
      {(bank || card) && (
        <Field label="Bank" hint={bank ? "Filled in from the IFSC when it can." : undefined}>
          <input name="bank_name" maxLength={120} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="State Bank of India" style={field} />
        </Field>
      )}

      {card && (
        <>
          <Field label="Last 4 digits of the card" hint="Never the full card number or CVV."><input name="last4" inputMode="numeric" maxLength={4} pattern="\d{4}" defaultValue={a?.last4} style={field} /></Field>
          <Field label="Card limit (₹)"><input name="credit_limit" required inputMode="decimal" defaultValue={a?.limit} placeholder="200000" style={field} /></Field>
          <Field label="Bill date (day of month)" hint="The day the card statement is made."><input name="bill_day" type="number" required min={1} max={31} defaultValue={a?.billDay} placeholder="15" style={field} /></Field>
          <Field label="Payment due date (day of month)"><input name="due_day" type="number" required min={1} max={31} defaultValue={a?.dueDay} placeholder="5" style={field} /></Field>
          <Field label="Owed on the card (₹)" hint="As the card app shows on the date beside. 0 if nothing.">
            <input name="owed_today" inputMode="decimal" defaultValue={a?.amount ?? "0"} style={field} />
          </Field>
        </>
      )}
      {!card && (
        <Field label="Balance (₹)" hint="What is in it on the date beside.">
          <input name="opening_balance" inputMode="decimal" defaultValue={a?.amount ?? "0"} style={field} />
        </Field>
      )}
      <Field label="As on"><input type="date" name="opening_date" defaultValue={a?.date || today} max={today} style={field} /></Field>
      <Field label="Note (optional)"><input name="note" maxLength={300} defaultValue={a?.note} style={field} /></Field>
      <div style={{ alignSelf: "end" }}><SubmitButton label={a ? "Save changes" : "Add account"} /></div>
    </form>
  );
}
