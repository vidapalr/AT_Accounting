/** Forms for Accounting > My money (owner only). Server-safe: plain forms posting to server actions. */
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/ui";
import { fieldFull as field, formGrid } from "@/lib/ui/styles";
import {
  addPersonalEntryAction, addPersonalInvestmentAction, addPersonalLoanAction,
} from "@/lib/personal-money-actions";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/personal-money";
import { rupeesText } from "@/lib/sale-payments";

type Opt = { id: number; name: string };

export function AccountSelect({ accounts, name = "account_id", label, optional, defaultId }: { accounts: Opt[]; name?: string; label: string; optional?: string; defaultId?: number }) {
  return (
    <Field label={label}>
      <select name={name} required={!optional} defaultValue={defaultId ?? ""} style={field}>
        <option value="">{optional ?? "Choose…"}</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </Field>
  );
}

const Amount = ({ label = "Amount (₹)", name = "amount" }: { label?: string; name?: string }) => (
  <Field label={label}><input name={name} required inputMode="decimal" placeholder="1500" style={field} /></Field>
);
const DateField = ({ today, name = "entry_date", label = "Date" }: { today: string; name?: string; label?: string }) => (
  <Field label={label}><input type="date" name={name} defaultValue={today} max={today} required style={field} /></Field>
);
const Note = () => <Field label="Note (optional)"><input name="note" maxLength={300} style={field} /></Field>;

/** Money in, spent, or moved between your accounts (also: paying a credit card bill). */
export function EntryForm({ kind, accounts, today, tab, defaultAccount, stayOn }: { kind: "INCOME" | "EXPENSE" | "TRANSFER"; accounts: Opt[]; today: string; tab: string; defaultAccount?: number; stayOn?: number }) {
  const cats = kind === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    <form action={addPersonalEntryAction} style={formGrid}>
      {stayOn ? <input type="hidden" name="account" value={stayOn} /> : null}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="tab" value={tab} />
      <Amount />
      {kind === "TRANSFER" ? (
        <>
          <AccountSelect accounts={accounts} label="From" defaultId={defaultAccount} />
          <AccountSelect accounts={accounts} name="to_account_id" label="To (for a card bill, choose the card)" />
        </>
      ) : (
        <>
          <AccountSelect accounts={accounts} label={kind === "INCOME" ? "Came into" : "Paid from (bank, card or cash)"} defaultId={defaultAccount} />
          <Field label="What for">
            <select name="category" defaultValue={cats[0]} style={field}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
        </>
      )}
      <DateField today={today} />
      <Note />
      <div style={{ alignSelf: "end" }}><SubmitButton label="Save" /></div>
    </form>
  );
}

/** "Pay this bill": money moves from a bank (or cash) into the card; it is not counted as spending again. */
export function CardPayForm({ cardId, accounts, today, amount }: { cardId: number; accounts: Opt[]; today: string; amount: bigint }) {
  return (
    <form action={addPersonalEntryAction} style={formGrid}>
      <input type="hidden" name="kind" value="TRANSFER" />
      <input type="hidden" name="to_account_id" value={cardId} />
      <input type="hidden" name="tab" value="accounts" />
      <input type="hidden" name="account" value={cardId} />
      <Field label="Amount paid (₹)" hint="Full bill, minimum due or any part."><input name="amount" required inputMode="decimal" defaultValue={amount > 0n ? rupeesText(amount) : ""} style={field} /></Field>
      <AccountSelect accounts={accounts} label="Paid from" />
      <DateField today={today} />
      <div style={{ alignSelf: "end" }}><SubmitButton label="Save payment" /></div>
    </form>
  );
}

export function LoanForm({ accounts, today }: { accounts: Opt[]; today: string }) {
  return (
    <form action={addPersonalLoanAction} style={formGrid}>
      <Field label="I">
        <select name="direction" defaultValue="TAKEN" style={field}>
          <option value="TAKEN">borrowed (home loan, car loan, from a person)</option>
          <option value="GIVEN">lent to someone</option>
        </select>
      </Field>
      <Field label="With whom"><input name="party_name" required maxLength={150} placeholder="SBI home loan / Ramesh" style={field} /></Field>
      <Amount label="Amount (₹)" />
      <AccountSelect accounts={accounts} label="Money moved through" optional="Older loan: amount is what is still owed today" />
      <DateField today={today} name="start_date" label="Start date" />
      <Field label="Interest (% a year, optional)"><input name="interest_rate" inputMode="decimal" style={field} /></Field>
      <Field label="EMI (₹, optional)"><input name="emi_amount" inputMode="decimal" style={field} /></Field>
      <Field label="EMI day of month (optional)"><input name="emi_day" type="number" min={1} max={31} style={field} /></Field>
      <Field label="Last EMI date (optional)"><input type="date" name="end_date" style={field} /></Field>
      <Note />
      <div style={{ alignSelf: "end" }}><SubmitButton label="Add loan" /></div>
    </form>
  );
}

/** EMI paid, or money received back, on one loan. */
export function LoanPaymentForm({ loanId, direction, accounts, today, emi }: { loanId: number; direction: "GIVEN" | "TAKEN"; accounts: Opt[]; today: string; emi: bigint | null }) {
  return (
    <form action={addPersonalEntryAction} style={formGrid}>
      <input type="hidden" name="kind" value={direction === "TAKEN" ? "LOAN_PAID" : "LOAN_RECEIVED"} />
      <input type="hidden" name="loan_id" value={loanId} />
      <input type="hidden" name="tab" value="loans" />
      <Field label={direction === "TAKEN" ? "Paid (₹)" : "Received (₹)"}><input name="amount" required inputMode="decimal" defaultValue={emi != null ? rupeesText(emi) : ""} style={field} /></Field>
      <Field label="Of which interest (₹)" hint="Leave 0 if you don't know."><input name="interest_amount" inputMode="decimal" defaultValue="0" style={field} /></Field>
      <AccountSelect accounts={accounts} label={direction === "TAKEN" ? "Paid from" : "Came into"} />
      <DateField today={today} />
      <div style={{ alignSelf: "end" }}><SubmitButton label={direction === "TAKEN" ? "Save payment" : "Save money received"} /></div>
    </form>
  );
}

const INV_KINDS: Array<[string, string]> = [["FD", "Fixed deposit"], ["RD", "Recurring deposit"], ["GOLD", "Gold / silver"], ["SHARES", "Shares"], ["MUTUAL_FUND", "Mutual fund / SIP"], ["CHIT", "Chit fund"], ["PROPERTY", "Land / property"], ["INSURANCE", "Insurance (savings)"], ["OTHER", "Other"]];
export const INVESTMENT_KIND_WORDS = Object.fromEntries(INV_KINDS) as Record<string, string>;

export function InvestmentForm({ accounts, today }: { accounts: Opt[]; today: string }) {
  return (
    <form action={addPersonalInvestmentAction} style={formGrid}>
      <Field label="Kind"><select name="kind" defaultValue="FD" style={field}>{INV_KINDS.map(([k, w]) => <option key={k} value={k}>{w}</option>)}</select></Field>
      <Field label="Name"><input name="name" required maxLength={150} placeholder="SBI FD 2027" style={field} /></Field>
      <Amount label="Amount put in (₹)" />
      <AccountSelect accounts={accounts} label="Paid from" optional="Older one: already paid earlier" />
      <DateField today={today} name="start_date" />
      <Field label="Value today (₹, optional)"><input name="current_value" inputMode="decimal" style={field} /></Field>
      <Field label="Maturity date (optional)"><input type="date" name="maturity_date" style={field} /></Field>
      <Note />
      <div style={{ alignSelf: "end" }}><SubmitButton label="Add investment" /></div>
    </form>
  );
}

/** Put more into, or take money out of, one investment. */
export function InvestmentMoveForm({ investmentId, accounts, today }: { investmentId: number; accounts: Opt[]; today: string }) {
  return (
    <form action={addPersonalEntryAction} style={formGrid}>
      <input type="hidden" name="investment_id" value={investmentId} />
      <input type="hidden" name="tab" value="investments" />
      <Field label="I"><select name="kind" defaultValue="INVEST" style={field}><option value="INVEST">put more in</option><option value="REDEEM">took money out</option></select></Field>
      <Amount />
      <AccountSelect accounts={accounts} label="Account" />
      <DateField today={today} />
      <div style={{ alignSelf: "end" }}><SubmitButton label="Save" /></div>
    </form>
  );
}
