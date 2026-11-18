import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import { todayInIndia } from "@/lib/format";
import { daysToRenewal, REGISTRATION_KINDS } from "@/lib/registrations";
import { removeRegistrationAction, saveRegistrationAction } from "@/lib/registration-actions";
import { secretsReady } from "@/lib/secret-box";
import RevealPassword from "@/components/RevealPassword";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { box, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ edit?: string; saved?: string; error?: string }> };
const kindLabel = (k: string) => REGISTRATION_KINDS.find((x) => x.key === k)?.label ?? k;

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  let rows: RowDataPacket[] = [];
  let views: RowDataPacket[] = [];
  let ready = true;
  try {
    [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, kind, label, registration_no, portal_url, login_id, password_cipher IS NOT NULL AS has_password,
              DATE_FORMAT(registered_on, '%Y-%m-%d') AS registered_on, DATE_FORMAT(renewal_due, '%Y-%m-%d') AS renewal_due, note
         FROM acct_statutory_logins WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY FIELD(kind, 'GST','INCOME_TAX','TDS','PF','ESI'), label`,
      [user.legal_business_id]
    );
    [views] = await db.query<RowDataPacket[]>(
      `SELECT v.login_id, u.full_name, DATE_FORMAT(v.viewed_at, '%d-%m-%Y %H:%i') AS t
         FROM acct_statutory_login_views v LEFT JOIN acct_app_users u ON u.id = v.viewed_by
        WHERE v.legal_business_id = ? ORDER BY v.viewed_at DESC LIMIT 20`,
      [user.legal_business_id]
    );
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    ready = false;
  }
  const editing = rows.find((r) => String(r.id) === q.edit) ?? null;
  const titleOf = (id: number) => String(rows.find((r) => Number(r.id) === id)?.label ?? "Removed login");

  return (
    <main style={{ maxWidth: 960 }}>
      <PageHeader
        title="Registrations and portal logins"
        intro="PF, ESI, GST, income tax and other registrations in one place: numbers, portal, login and password. Passwords are kept encrypted; only the owner and the accountant can show one, and every showing is recorded."
      />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {!ready ? <Notice tone="error">Run migration 091 in phpMyAdmin first.</Notice> : null}
      {ready && !secretsReady() ? <Notice tone="error">The server has no encryption key, so passwords cannot be saved yet. Numbers and login IDs can.</Notice> : null}

      {rows.length === 0 && ready ? <EmptyState>Nothing saved yet. Add the first registration below.</EmptyState> : null}
      {rows.map((r) => {
        const due = daysToRenewal(today, r.renewal_due ? String(r.renewal_due) : null);
        return (
          <section key={String(r.id)} style={box}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{String(r.label)} <span style={muted}>· {kindLabel(String(r.kind))}</span></h2>
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", margin: 0 }}>
              {r.registration_no ? <><dt style={muted}>Number</dt><dd style={{ margin: 0 }}>{String(r.registration_no)}</dd></> : null}
              {r.portal_url ? <><dt style={muted}>Portal</dt><dd style={{ margin: 0 }}><a href={String(r.portal_url)} target="_blank" rel="noopener noreferrer">{String(r.portal_url)}</a></dd></> : null}
              {r.login_id ? <><dt style={muted}>Login ID</dt><dd style={{ margin: 0 }}>{String(r.login_id)}</dd></> : null}
              <dt style={muted}>Password</dt><dd style={{ margin: 0 }}>{Number(r.has_password) ? <RevealPassword id={Number(r.id)} /> : "Not saved"}</dd>
              {r.renewal_due ? <><dt style={muted}>Renewal</dt><dd style={{ margin: 0, color: due !== null && due <= 30 ? "#b91c1c" : undefined }}>{String(r.renewal_due)}{due !== null ? (due < 0 ? " (overdue)" : ` (${due} days)`) : ""}</dd></> : null}
              {r.note ? <><dt style={muted}>Note</dt><dd style={{ margin: 0 }}>{String(r.note)}</dd></> : null}
            </dl>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Link className="btn-link" href={`/accounting/registrations?edit=${r.id}#form`}>Change</Link>
              <form action={removeRegistrationAction}>
                <input type="hidden" name="id" value={String(r.id)} />
                <SubmitButton label="Remove" className="btn-link" question="Remove this registration and delete its saved password?" />
              </form>
            </div>
          </section>
        );
      })}

      {ready ? (
        <form action={saveRegistrationAction} id="form">
          {editing ? <input type="hidden" name="id" value={String(editing.id)} /> : null}
          <Section title={editing ? `Change ${String(editing.label)}` : "Add a registration"}>
            <div style={formGrid}>
              <Field label="What it is for">
                <select name="kind" defaultValue={String(editing?.kind ?? "GST")} style={fieldFull}>
                  {REGISTRATION_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="Name"><input name="label" defaultValue={String(editing?.label ?? "")} placeholder="e.g. GST login" required maxLength={100} style={fieldFull} /></Field>
              <Field label="Registration number" hint="GSTIN, PAN, TAN, PF or ESI code…"><input name="registration_no" defaultValue={String(editing?.registration_no ?? "")} maxLength={60} style={fieldFull} /></Field>
              <Field label="Portal address" hint={`Usual portals: ${REGISTRATION_KINDS.filter((k) => k.portal).map((k) => `${k.label} ${k.portal}`).slice(0, 2).join("; ")}…`}>
                <input name="portal_url" defaultValue={String(editing?.portal_url ?? "")} placeholder="https://" style={fieldFull} />
              </Field>
              <Field label="Login ID"><input name="login_id" defaultValue={String(editing?.login_id ?? "")} maxLength={120} autoComplete="off" style={fieldFull} /></Field>
              <Field label={editing ? "New password (leave empty to keep the saved one)" : "Password"}>
                <input type="password" name="password" autoComplete="new-password" maxLength={200} style={fieldFull} />
              </Field>
              <Field label="Registered on"><input type="date" name="registered_on" defaultValue={String(editing?.registered_on ?? "")} style={fieldFull} /></Field>
              <Field label="Renewal due (if any)"><input type="date" name="renewal_due" defaultValue={String(editing?.renewal_due ?? "")} style={fieldFull} /></Field>
            </div>
            <Field label="Note (optional)"><input name="note" defaultValue={String(editing?.note ?? "")} maxLength={300} style={fieldFull} /></Field>
          </Section>
          <SubmitButton label={editing ? "Save changes" : "Add registration"} />
          {editing ? <Link className="btn-link" href="/accounting/registrations" style={{ marginLeft: 8 }}>Cancel</Link> : null}
        </form>
      ) : null}

      {views.length ? (
        <Section title="Passwords shown recently">
          <ul style={{ margin: 0 }}>
            {views.map((v, i) => <li key={i}>{titleOf(Number(v.login_id))}: shown to {String(v.full_name ?? "a user")} on {String(v.t)}</li>)}
          </ul>
        </Section>
      ) : null}
    </main>
  );
}

export default function RegistrationsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
