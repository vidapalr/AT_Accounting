import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { loadLetterTemplate } from "@/lib/letter-templates";
import { resetLetterTemplateAction, saveLetterTemplateAction } from "@/lib/letter-template-actions";
import { LETTER_FIELDS, TEMPLATE_LIST, type TemplateLetterType } from "@/lib/staff-letters";
import ConfirmButton from "@/components/ConfirmButton";
import { Field, PageHeader, ResultNotice, Section } from "@/components/ui";
import { bigButton, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ type?: string; result?: string }> };

const TEMPLATE_TYPES = TEMPLATE_LIST;

const MESSAGES = {
  saved: { tone: "ok", text: "Saved. Every letter of this kind now uses this wording." },
  reset: { tone: "ok", text: "Back to the standard wording." },
  empty: { tone: "error", text: "The heading and the wording cannot be empty." },
  invalid: { tone: "error", text: "That letter was not found." },
} as const;

async function Content({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const q = await searchParams;
  const type = (TEMPLATE_TYPES.find((t) => t.key === q.type)?.key ?? "offer") as TemplateLetterType;
  const template = await loadLetterTemplate(user.legal_business_id, type);

  return (
    <main style={{ maxWidth: 980 }}>
      <PageHeader
        title="Letter templates"
        intro="The wording of offer, joining, salary, resignation and other staff letters. Change it once here; every letter printed from a staff record uses it."
        back={{ href: "/accounting/salaries", label: "Salaries" }}
      />
      <ResultNotice result={q.result} messages={MESSAGES} />

      <nav aria-label="Letters" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {TEMPLATE_TYPES.map((t) => (
          <Link key={t.key} href={`/accounting/letter-templates?type=${t.key}`} className={`btn-link${t.key === type ? " btn-link-primary" : ""}`}>{t.label}</Link>
        ))}
      </nav>

      <Section title={TEMPLATE_TYPES.find((t) => t.key === type)?.label} aside={<span style={muted}>{template.custom ? "Your own wording" : "Standard wording"}</span>}>
        <form action={saveLetterTemplateAction} style={{ display: "grid", gap: 14 }}>
          <input type="hidden" name="letter_type" value={type} />
          <Field label="Heading"><input name="heading" defaultValue={template.heading} maxLength={120} required style={fieldFull} /></Field>
          <Field label="Wording" hint="A blank line starts a new paragraph. A line starting with “- ” becomes a numbered point; a line starting with “## ” becomes a sub-heading. Use the blanks listed below.">
            <textarea name="body" defaultValue={template.body} rows={18} required style={{ ...fieldFull, fontFamily: "inherit", lineHeight: 1.5 }} />
          </Field>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="needs_acceptance" value="1" defaultChecked={template.needsAcceptance} />
            Print a place for the employee to sign and accept
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" className="btn-link btn-link-primary" style={bigButton}>Save wording</button>
          </div>
        </form>
        {template.custom ? (
          <form action={resetLetterTemplateAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="letter_type" value={type} />
            <ConfirmButton label="Use the standard wording" question="Go back to the standard wording for this letter? Your own wording will be removed." />
          </form>
        ) : null}
      </Section>

      <Section title="Blanks you can use">
        <div style={formGrid}>
          {LETTER_FIELDS.map((f) => (
            <div key={f.key}><code>{`{{${f.key}}}`}</code><div style={muted}>{f.help}</div></div>
          ))}
        </div>
      </Section>
    </main>
  );
}

export default function LetterTemplatesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
