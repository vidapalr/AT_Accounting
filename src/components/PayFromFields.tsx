import { Field } from "@/components/ui";
import { fieldFull } from "@/lib/ui/styles";
import type { PaymentAccount } from "@/lib/payment-accounts";

/** "Paid from" account and "How" pickers, the same on every screen that pays money out. */
export default function PayFromFields({ accounts, form, allowOther = false }: { accounts: PaymentAccount[]; form?: string; allowOther?: boolean }) {
  return (
    <>
      <Field label="Paid from">
        <select name="account" required defaultValue="" style={fieldFull} form={form}>
          <option value="" disabled>Choose…</option>
          {accounts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </Field>
      <Field label="How">
        <select name="how" required defaultValue="BANK_TRANSFER" style={fieldFull} form={form}>
          <option value="CASH">Cash</option>
          <option value="UPI">UPI</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="CHEQUE">Cheque</option>
          {allowOther ? <option value="OTHER">Online challan</option> : null}
        </select>
      </Field>
    </>
  );
}
