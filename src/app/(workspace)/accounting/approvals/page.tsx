import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import SubmitButton from "@/components/SubmitButton";
import {
  KIND_LABEL, STATUS_WORDS, canCancel, canCheck, canFinalApprove, canReject,
  type ApprovalKind, type RequestStatus,
} from "@/lib/approval-rules";
import {
  approveRequestAction, cancelRequestAction, checkRequestAction, rejectRequestAction,
} from "@/lib/approval-request-actions";

type Props = { searchParams: Promise<{ result?: string }> };
type Row = RowDataPacket & Record<string, unknown>;

const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const MESSAGES: Record<string, [string, boolean]> = {
  checked: ["Checked and passed on for final approval.", true],
  approved: ["Approved, and the entry has been posted.", true],
  failed: ["Approved, but the entry could not be posted. See the reason below.", false],
  rejected: ["Rejected.", true],
  cancelled: ["Withdrawn.", true],
  "reason-needed": ["Please type a reason to reject.", false],
  "not-allowed": ["That is no longer possible (someone else may have acted, or it is your own request).", false],
  invalid: ["Something was wrong with that request.", false],
};
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, margin: "12px 0", background: "#fff" };
const big: React.CSSProperties = { fontSize: 16, padding: "12px 22px" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("approval_requests");
  const { result = "" } = await searchParams;

  let rows: Row[] = [];
  try {
    [rows] = await db.execute<Row[]>(
      `SELECT r.*, DATE_FORMAT(CONVERT_TZ(r.created_at, '+00:00', '+05:30'), '%d %b %Y, %H:%i') AS at,
              q.full_name AS requester, c.full_name AS checker, f.full_name AS finaler
         FROM acct_approval_requests r
         LEFT JOIN acct_app_users q ON q.id = r.requested_by
         LEFT JOIN acct_app_users c ON c.id = r.checked_by
         LEFT JOIN acct_app_users f ON f.id = r.final_by
        WHERE r.legal_business_id = ?
        ORDER BY r.id DESC LIMIT 200`, [user.legal_business_id]);
  } catch (e) {
    if (isMissingTable(e)) return <p role="alert" style={{ color: "#b91c1c" }}>Approvals are not set up yet. Run database step 081 (migrations/081_approval_requests.sql).</p>;
    throw e;
  }

  const view = (r: Row) => ({ status: String(r.status) as RequestStatus, requestedBy: Number(r.requested_by) });
  const mine = (r: Row) => canCheck(user.role, user.id, view(r)) || canFinalApprove(user.role, user.id, view(r));
  const toAct = rows.filter(mine);
  const others = rows.filter((r) => !mine(r));
  const msg = MESSAGES[result];

  const card = (r: Row) => {
    const v = view(r);
    return (
      <div key={String(r.id)} style={box}>
        <strong>{KIND_LABEL[String(r.kind) as ApprovalKind] ?? String(r.kind)} · {rupees(BigInt(String(r.amount)))}</strong>
        <div style={{ color: "#475569", margin: "4px 0" }}>{String(r.summary)}</div>
        <div style={{ color: "#64748b", fontSize: 14 }}>
          Asked by {String(r.requester ?? "?")} on {String(r.at)}
          {r.checker ? ` · checked by ${String(r.checker)}` : ""}
          {r.finaler && v.status !== "WAITING_FINAL" ? ` · ${v.status === "REJECTED" ? "rejected" : v.status === "CANCELLED" ? "withdrawn" : "approved"} by ${String(r.finaler)}` : ""}
        </div>
        <div style={{ margin: "6px 0", color: v.status === "APPROVED" ? "#166534" : v.status === "FAILED" || v.status === "REJECTED" ? "#b91c1c" : "#92400e" }}>
          {STATUS_WORDS[v.status]}
          {r.reject_reason ? `: ${String(r.reject_reason)}` : ""}
          {v.status === "FAILED" && r.result_note ? `: ${String(r.result_note)}` : ""}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          {canCheck(user.role, user.id, v) && (
            <form action={checkRequestAction}><input type="hidden" name="id" value={String(r.id)} /><SubmitButton label="Checked, pass on" /></form>
          )}
          {canFinalApprove(user.role, user.id, v) && (
            <form action={approveRequestAction}><input type="hidden" name="id" value={String(r.id)} /><SubmitButton label="Approve and post" question="Approve this and post the entry now?" /></form>
          )}
          {canReject(user.role, user.id, v) && (
            <form action={rejectRequestAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="hidden" name="id" value={String(r.id)} />
              <input name="reason" placeholder="Reason" maxLength={300} style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 16 }} />
              <button type="submit" className="btn-link" style={{ ...big, cursor: "pointer" }}>Reject</button>
            </form>
          )}
          {canCancel(user.id, v) && (
            <form action={cancelRequestAction}><input type="hidden" name="id" value={String(r.id)} /><button type="submit" className="btn-link" style={{ ...big, cursor: "pointer" }}>Withdraw</button></form>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {msg && <p role="status" style={{ color: msg[1] ? "#166534" : "#b91c1c" }}>{msg[0]}</p>}
      <h2>Waiting for you ({toAct.length})</h2>
      {toAct.length === 0 ? <p style={{ color: "#64748b" }}>Nothing is waiting for you.</p> : toAct.map(card)}
      <h2>Everything else</h2>
      {others.length === 0 ? <p style={{ color: "#64748b" }}>No other requests yet.</p> : others.map(card)}
    </>
  );
}

export default function ApprovalsPage(props: Props) {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <h1>Approvals</h1>
      <p style={{ color: "#475569" }}>
        An entry above its limit is not posted. The accountant checks it, then the division manager or the owner approves it for good, and it posts by itself. The owner can approve at any step. Nobody approves their own request.
      </p>
      <Suspense fallback={<p>Loading...</p>}><Content {...props} /></Suspense>
    </main>
  );
}
