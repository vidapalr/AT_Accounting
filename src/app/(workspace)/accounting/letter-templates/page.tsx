import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { businessSettings } from "@/lib/business-settings";
import { loadLetterTemplate } from "@/lib/letter-templates";
import { resetAllLetterTemplatesAction, resetLetterTemplateAction, saveLetterTemplateAction, saveLetterWhatsAppTemplateAction } from "@/lib/letter-template-actions";
import { LETTER_FIELDS, PACK_LETTERS, TEMPLATE_LIST, type LetterType, type TemplateLetterType } from "@/lib/staff-letters";
import { LETTER_TEMPLATE_KEYS, LETTER_TEMPLATE_TEXT } from "@/lib/letter-accept";
import ConfirmButton from "@/components/ConfirmButton";
import { Badge, Field, PageHeader, ResultNotice, Section } from "@/components/ui";
import { bigButton, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ type?: string; result?: string }> };

const MESSAGES = {
  saved: { tone: "ok", text: "Saved. Every letter of this kind now uses this wording." },
  reset: { tone: "ok", text: "Back to the standard wording." },
  resetall: { tone: "ok", text: "Every letter now uses the standard corporate wording." },
  template: { tone: "ok", text: "WhatsApp template saved. Letters are now sent with it." },
  badtemplate: { tone: "error", text: "Write the template name exactly as approved (small letters, numbers and _), and the language code, e.g. en or en_US." },
  empty: { tone: "error", text: "The heading and the wording cannot be empty." },
  invalid: { tone: "error", text: "That letter was not found." },
} as const;

/** Which page of the four-page pack each joining template fills. */
const isPackPart = (k: TemplateLetterType) => k === "terms_monthly" || k === "terms_wage" || PACK_LETTERS.has(k as LetterType);
const GROUPS: Array<{ title: string; keys: TemplateLetterType[] }> = [
  { title: "Offer and joining pack (4 pages)", keys: TEMPLATE_LIST.filter((t) => isPackPart(t.key)).map((t) => t.key) },
  { title: "Other letters (1 page)", keys: TEMPLATE_LIST.filter((t) => !isPackPart(t.key)).map((t) => t.key) },
];

async function Content({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const q = await searchParams;
  const type = (TEMPLATE_LIST.find((t) => t.key === q.type)?.key ?? "offer") as TemplateLetterType;
  const template = await loadLetterTemplate(user.legal_business_id, type);
  const [own] = await db.execute<RowDataPacket[]>(
    `SELECT letter_type FROM acct_letter_templates WHERE legal_business_id = ?`, [user.legal_business_id]
  ).catch(() => [[] as RowDataPacket[]]);
  const custom = new Set(own.map((r) => String(r.letter_type)));
  const wa = await businessSettings(user.legal_business_id, [LETTER_TEMPLATE_KEYS.name, LETTER_TEMPLATE_KEYS.language]);
  const label = TEMPLATE_LIST.find((t) => t.key === type)?.label ?? "";
  const isTerms = type === "terms_monthly" || type === "terms_wage";

  return (
    <main style={{ maxWidth: 1060 }}>
      <PageHeader
        title="Letter templates"
        intro="The wording of every staff letter. Change it once here; every letter made from a staff record uses it."
        back={{ href: "/accounting/salaries", label: "Staff records" }}
      />
      <ResultNotice result={q.result} messages={MESSAGES} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) 1fr", gap: 20, alignItems: "start", marginTop: 12 }}>
        <nav aria-label="Letters" style={{ display: "grid", gap: 16 }}>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div style={{ fontWeight: 700, color: "#142c50", marginBottom: 6 }}>{g.title}</div>
              <div style={{ display: "grid", gap: 4 }}>
                {g.keys.map((k) => {
                  const on = k === type;
                  return (
                    <Link key={k} href={`/accounting/letter-templates?type=${k}`} aria-current={on ? "page" : undefined}
                      style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 8, textDecoration: "none", background: on ? "#142c50" : "#f8fafc", color: on ? "#fff" : "#0f172a", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: 14 }}>{TEMPLATE_LIST.find((t) => t.key === k)?.label}</span>
                      {custom.has(k) ? <Badge tone="info">Own</Badge> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {custom.size > 0 && (
            <form action={resetAllLetterTemplatesAction}>
              <p style={{ ...muted, margin: "0 0 6px" }}>{custom.size} letter{custom.size === 1 ? " uses" : "s use"} your own older wording.</p>
              <ConfirmButton label="Use the new standard wording for all" question="Replace your own wording on every letter with the standard corporate wording? This cannot be undone." />
            </form>
          )}
        </nav>

        <div>
          {isPackPart(type) && (
            <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <strong>How the four pages are made</strong>
              <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                <li>Welcome letter: the wording of the offer, appointment or engagement letter{!isTerms ? " (this page)" : ""}.</li>
                <li>Joining details: made automatically from the staff record (Employee ID, date, place, hours, documents to bring).</li>
                <li>Terms and conditions: the &ldquo;Terms and conditions page&rdquo; wording{isTerms ? " (this page)" : ""}; it is fitted onto one page.</li>
                <li>Salary annexure and acceptance: worked out from the pay and Payroll settings.</li>
              </ol>
            </div>
          )}

          <Section title={label} aside={<span style={muted}>{template.custom ? "Your own wording" : "Standard wording"}</span>}>
            <form action={saveLetterTemplateAction} style={{ display: "grid", gap: 14 }}>
              <input type="hidden" name="letter_type" value={type} />
              <Field label="Heading"><input name="heading" defaultValue={template.heading} maxLength={120} required style={fieldFull} /></Field>
              <Field label="Wording" hint="A blank line starts a new paragraph. A line starting with “- ” becomes a numbered point; a line starting with “## ” becomes a sub-heading. Use the blanks listed below.">
                <textarea name="body" defaultValue={template.body} rows={isTerms ? 28 : 16} required style={{ ...fieldFull, fontFamily: "inherit", lineHeight: 1.5 }} />
              </Field>
              {!isTerms && (
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" name="needs_acceptance" value="1" defaultChecked={template.needsAcceptance} />
                  Ask the employee to accept (signature box, and I accept on WhatsApp)
                </label>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" className="btn-link btn-link-primary" style={bigButton}>Save wording</button>
                <Link className="btn-link" href="/accounting/salaries">See it on a staff letter</Link>
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

          <div id="whatsapp">
            <Section title="Sending letters on WhatsApp" aside={wa[LETTER_TEMPLATE_KEYS.name] ? <Badge tone="ok">Template set</Badge> : <Badge tone="wait">No template yet</Badge>}>
              <p style={{ marginTop: 0 }}>
                Without a template, a letter reaches the person only if they messaged the shop number in the last 24 hours (staff who send IN every day are fine).
                To send to anyone at any time, create this template in WhatsApp Manager → Message templates, wait for Meta to approve it, then type its name here.
              </p>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, fontSize: 14 }}>
                <div><strong>Category:</strong> Utility · <strong>Name:</strong> staff_letter · <strong>Language:</strong> English</div>
                <div><strong>Header:</strong> Document</div>
                <div><strong>Body:</strong> {LETTER_TEMPLATE_TEXT.body}</div>
                <div><strong>Sample values:</strong> {LETTER_TEMPLATE_TEXT.sample.join(" · ")}</div>
                <div><strong>Button:</strong> Quick reply: {LETTER_TEMPLATE_TEXT.button}</div>
              </div>
              <form action={saveLetterWhatsAppTemplateAction} style={{ ...formGrid, marginTop: 12 }}>
                <Field label="Template name (as approved)"><input name="template_name" defaultValue={wa[LETTER_TEMPLATE_KEYS.name]} placeholder="staff_letter" style={fieldFull} /></Field>
                <Field label="Language code"><input name="template_language" defaultValue={wa[LETTER_TEMPLATE_KEYS.language] || "en"} style={fieldFull} /></Field>
                <div style={{ alignSelf: "end" }}><button type="submit" className="btn-link btn-link-primary" style={bigButton}>Save</button></div>
              </form>
              <p style={muted}>Leave the name empty to send without a template. Meta charges a small fee for each template message; add a payment method in WhatsApp Manager first.</p>
            </Section>
          </div>
        </div>
      </div>
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
