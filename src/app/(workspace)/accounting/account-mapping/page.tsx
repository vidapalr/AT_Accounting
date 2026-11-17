import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { saveAccountMapAction } from "@/lib/account-map-actions";
import { loadCodeMap } from "@/lib/ledger/account-map";
import { ACCOUNT_ROLES } from "@/lib/ledger/account-roles";
import { Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { bigButton, cellTop, fieldFull, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ result?: string; code?: string; detail?: string }> };

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const q = await searchParams;
  const biz = user.legal_business_id;

  const [chart] = await db.execute<RowDataPacket[]>(
    `SELECT account_code, account_name FROM acct_chart_of_accounts
      WHERE legal_business_id = ? AND status = 'ACTIVE' AND is_posting_account = 1 ORDER BY account_code`,
    [biz]
  );
  const accounts = chart.map((c) => ({ code: String(c.account_code), name: String(c.account_name) }));
  const nameOf = new Map(accounts.map((a) => [a.code, a.name]));
  const current = await loadCodeMap(db, biz);
  const groups = [...new Set(ACCOUNT_ROLES.map((r) => r.group))];

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader
        title="Account mapping"
        intro="Which account in your chart of accounts each kind of entry is posted to. Leave a line on Standard unless your accountant uses a different account."
      />
      <ResultNotice
        result={q.result}
        messages={{
          saved: { tone: "ok", text: "Saved. New postings use these accounts; entries already posted are not changed." },
          unknown: { tone: "error", text: `Account ${q.code ?? ""} does not exist or cannot be posted to. Add it on Chart of accounts first.` },
          clash: { tone: "error", text: q.detail ?? "Two kinds of entry cannot share one account." },
        }}
      />
      <Notice tone="info">Changing an account here affects only entries posted from now on. Ask your accountant before changing it in the middle of a year.</Notice>

      <form action={saveAccountMapAction}>
        {groups.map((g) => (
          <Section key={g} title={g}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {ACCOUNT_ROLES.filter((r) => r.group === g).map((r) => {
                  const chosen = current.get(r.standardCode) ?? r.standardCode;
                  return (
                    <tr key={r.key}>
                      <td style={{ ...cellTop, width: "45%" }}>
                        {r.label}
                        <div style={muted}>Standard: {r.standardCode} {nameOf.get(r.standardCode) ?? "(not in your chart)"}</div>
                      </td>
                      <td style={cellTop}>
                        <select name={`role_${r.key}`} defaultValue={chosen} style={fieldFull} aria-label={r.label}>
                          <option value={r.standardCode}>Standard ({r.standardCode})</option>
                          {accounts.filter((a) => a.code !== r.standardCode).map((a) => (
                            <option key={a.code} value={a.code}>{a.code} {a.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        ))}
        <button type="submit" className="btn-link btn-link-primary" style={bigButton}>Save account mapping</button>
      </form>
    </main>
  );
}

export default function AccountMappingPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
