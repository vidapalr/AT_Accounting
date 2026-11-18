import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { GST_STATES } from "@/lib/gst";
import { saveGstSettingsAction } from "@/lib/gst-actions";
import { Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ result?: string }> };

async function Settings({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const { result } = await searchParams;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings
      WHERE legal_business_id = ? AND setting_key LIKE 'gst\\_%'`,
    [user.legal_business_id]
  );
  const s = Object.fromEntries(rows.map((r) => [String(r.setting_key), String(r.setting_value)]));
  const status = s.gst_status ?? "NOT_REGISTERED";

  const [counts] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, SUM(hsn_code IS NOT NULL AND gst_rate IS NOT NULL) AS ready
       FROM acct_products WHERE legal_business_id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id]
  );
  const ready = Number(counts[0].ready ?? 0);
  const total = Number(counts[0].total);

  return (
    <main style={{ maxWidth: 820 }}>
      <PageHeader title="GST settings" intro="Your GST registration. Bills, purchases and expenses follow it from the GST start date." />
      <ResultNotice
        result={result}
        messages={{
          saved: { tone: "ok", text: "Saved." },
          invalid: { tone: "error", text: "Please check the details. A registered business needs a valid GSTIN, its matching state and a start date; the composition rate is a number such as 1." },
        }}
      />

      {status === "NOT_REGISTERED" ? (
        <Notice tone="info">
          <strong>Not registered for GST.</strong> Bills show no tax, exactly as today. A business that is not registered must not charge GST.
          When you register, choose the type below, type the GSTIN and the start date, and save: everything is ready.
        </Notice>
      ) : status === "REGULAR" ? (
        <Notice tone="ok">
          <strong>Regular GST from {s.gst_effective_date}.</strong> Prices include GST: every bill shows the GST inside the price. A business customer who gives a GSTIN gets a B2B tax invoice;
          everyone else gets a B2C tax invoice. Purchases from suppliers with a GSTIN give input credit; suppliers without one do not. See <Link href="/accounting/gst">GST returns and payments</Link>.
        </Notice>
      ) : (
        <Notice tone="ok">
          <strong>Composition scheme from {s.gst_effective_date}.</strong> Bills are &quot;bills of supply&quot; with no GST on them. You pay {s.gst_composition_rate ?? "1"}% of turnover each quarter
          and claim no GST back. Composition does not allow selling to other states or through online marketplaces. See <Link href="/accounting/gst">GST returns and payments</Link>.
        </Notice>
      )}

      <Section title="Product tax details">
        <p style={{ margin: "4px 0" }}>{ready} of {total} active products have an HSN code and a tax rate.{ready < total ? " Products without a rate are billed at 0% until one is filled." : ""}</p>
        <Link className="btn-link btn-link-primary" href="/accounting/products/gst">Fill product HSN codes and rates</Link>
      </Section>

      <form action={saveGstSettingsAction}>
        <Section title="Registration">
          <div style={formGrid}>
            <Field label="Registration type">
              <select name="status" defaultValue={status} style={fieldFull}>
                <option value="NOT_REGISTERED">Not registered yet</option>
                <option value="REGULAR">Regular GST</option>
                <option value="COMPOSITION">Composition scheme</option>
              </select>
            </Field>
            <Field label="GSTIN (when registered)">
              <input name="gstin" defaultValue={s.gst_gstin ?? ""} maxLength={15} placeholder="36ABCDE1234F1Z5" style={{ ...fieldFull, textTransform: "uppercase" }} />
            </Field>
            <Field label="State of registration">
              <select name="state_code" defaultValue={s.gst_state_code ?? ""} style={fieldFull}>
                <option value="">Choose a state</option>
                {GST_STATES.map((st) => <option key={st.code} value={st.code}>{st.name} ({st.code})</option>)}
              </select>
            </Field>
            <Field label="GST start date" hint="Bills, purchases and expenses dated on or after this day follow GST.">
              <input type="date" name="effective_date" defaultValue={s.gst_effective_date ?? ""} style={fieldFull} />
            </Field>
            <Field label="Composition rate (%)" hint="1% for traders. Used only on the composition scheme.">
              <input name="composition_rate" defaultValue={s.gst_composition_rate ?? "1"} inputMode="decimal" style={fieldFull} />
            </Field>
          </div>
          <p style={muted}>Selling prices include GST: the price on the tag is what the customer pays, and the bill shows the GST inside it.</p>
        </Section>
        <SubmitButton label="Save" question="Save the GST registration? Bills dated from the start date will follow it." />
      </form>
    </main>
  );
}

export default function GstSettingsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Settings {...props} /></Suspense>;
}
