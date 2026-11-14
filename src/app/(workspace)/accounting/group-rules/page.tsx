import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import SubmitButton from "@/components/SubmitButton";
import { DEFAULT_OWNER_MIN_UNITS, formatUnits, parseUnits } from "@/lib/investor-shares/engine";
import { saveOwnerMinShareAction } from "@/lib/group-rules-actions";
import { saveApprovalLimitsAction } from "@/lib/approval-request-actions";
import { loadLimits } from "@/lib/approval-requests";
import { APPROVAL_KINDS, KIND_LABEL, LIVE_KINDS } from "@/lib/approval-rules";

type Props = { searchParams: Promise<{ result?: string }> };

async function Rules({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const { result } = await searchParams;
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = 'owner_min_group_percent'`,
    [user.legal_business_id]
  );
  let units = DEFAULT_OWNER_MIN_UNITS;
  try { if (rows[0]) units = parseUnits(String(rows[0].setting_value)); } catch { /* keep default */ }
  const limits = await loadLimits(db, user.legal_business_id);
  const ownerMin = formatUnits(units);
  const investorMax = formatUnits(1_000_000 - units);

  const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 16 };
  const input: React.CSSProperties = { padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, width: 160, fontSize: 16 };

  return (
    <div style={{ maxWidth: 680 }}>
      <h1>Group rules</h1>
      {result === "saved" && <p role="status" style={{ color: "#166534" }}>Saved.</p>}
      {result === "limits-saved" && <p role="status" style={{ color: "#166534" }}>Approval limits saved.</p>}
      {result === "invalid-limit" && <p role="alert" style={{ color: "#b91c1c" }}>Type each limit as a rupee amount like 5000, or leave it empty.</p>}
      {result === "invalid" && <p role="alert" style={{ color: "#b91c1c" }}>Enter a number between 1 and 100, for example 51.</p>}
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Your share of the group</h2>
        <p style={{ color: "#475569" }}>
          You keep at least <strong>{ownerMin}</strong> of the group, so investors at group level can hold at most <strong>{investorMax}</strong> together.
          Investor agreements that would break this are refused.
        </p>
        <form action={saveOwnerMinShareAction} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label>Least share you keep (%)
            <br /><input name="owner_min" defaultValue={ownerMin.replace("%", "")} inputMode="decimal" style={input} />
          </label>
          <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "12px 20px", alignSelf: "flex-end" }}>Save</button>
        </form>
      </section>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Approval limits</h2>
        <p style={{ color: "#475569" }}>
          An entry above its limit is not posted until it is checked by the accountant and approved by the division manager or you. Leave a box empty for no limit. Your own entries never wait.
        </p>
        <form action={saveApprovalLimitsAction} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          {APPROVAL_KINDS.map((k) => (
            <label key={k}>{KIND_LABEL[k]} above (₹){LIVE_KINDS.includes(k) ? "" : " (coming soon)"}
              <br /><input name={`limit_${k}`} defaultValue={limits[k] === null ? "" : (Number(limits[k]) / 100).toString()} inputMode="decimal" style={{ ...input, width: "100%" }} />
            </label>
          ))}
          <SubmitButton label="Save limits" />
        </form>
      </section>
      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Funding limits</h2>
        <p style={{ margin: 0, color: "#475569" }}>
          The most an investor can put in is set on each investor&apos;s own agreement (the committed amount, or the maximum outstanding for a revolving one). Change it there.
        </p>
      </section>
    </div>
  );
}

export default function GroupRulesPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Rules {...props} /></Suspense>;
}
