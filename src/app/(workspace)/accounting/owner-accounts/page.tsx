import { Suspense } from "react";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { loadOwnerAccounts } from "@/lib/owner-accounts-data";
import { createOwnerAccountAction } from "@/lib/owner-account-actions";
import SubmitButton from "@/components/SubmitButton";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

const rupees = (p: bigint) => {
  const neg = p < 0n;
  const a = neg ? -p : p;
  return `${neg ? "-" : ""}₹${(a / 100n).toLocaleString("en-IN")}.${String(a % 100n).padStart(2, "0")}`;
};
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "12px", fontSize: 16, width: "100%" };

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const data = await loadOwnerAccounts(db, user.legal_business_id);

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Owner accounts</h1>
      <p style={{ color: "#64748b" }}>
        A place that holds business money in your name, such as your personal bank account. When cash is moved there at closing, it shows here.
        When you pay a business cost from it, pick it as the account and the balance goes down.
        In the books all of this is your capital in the business; this page only shows where the money is.
      </p>
      {query.saved && <p style={{ color: "#166534", fontSize: 17 }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      {!data.ready ? (
        <p style={{ color: "#b91c1c" }}>This page needs the new database step (076_owner_accounts_cash_destinations). Run it, then reload.</p>
      ) : (
        <>
          <section style={box}>
            <h2 style={{ marginTop: 0 }}>Add an owner account</h2>
            <form action={createOwnerAccountAction} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
              <label>Name<input name="account_name" required maxLength={100} placeholder="My HDFC savings" style={field} /></label>
              <label>Note (optional)<input name="note" maxLength={300} style={field} /></label>
              <div><SubmitButton label="Add account" /></div>
            </form>
          </section>

          {data.accounts.length === 0 && <p>No owner account yet.</p>}
          {data.accounts.map((a) => (
            <section key={a.id} style={box}>
              <h2 style={{ marginTop: 0 }}>{a.name}</h2>
              <p style={{ fontSize: 18, margin: "0 0 8px" }}>
                {a.balance >= 0n
                  ? <>You are holding <strong>{rupees(a.balance)}</strong> of business money here.</>
                  : <>The business owes you <strong>{rupees(-a.balance)}</strong> (you paid more than you received).</>}
              </p>
              <p style={{ color: "#64748b", margin: "0 0 8px" }}>Received {rupees(a.moneyIn)} · Paid out for the business {rupees(a.moneyOut)}</p>
              {a.lines.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
                    <thead><tr><th style={cell}>Day</th><th style={cell}>What</th><th style={right}>Received</th><th style={right}>Paid</th></tr></thead>
                    <tbody>
                      {a.lines.map((l, i) => (
                        <tr key={i}>
                          <td style={cell}>{pretty(l.date)}</td>
                          <td style={cell}>{l.label}</td>
                          <td style={right}>{l.direction === "IN" ? rupees(l.amount) : ""}</td>
                          <td style={right}>{l.direction === "OUT" ? rupees(l.amount) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
          {data.untaggedPaid > 0n && (
            <p style={{ color: "#92400e" }}>
              Business costs of {rupees(data.untaggedPaid)} were paid from &ldquo;owner&rsquo;s own money&rdquo; without choosing an owner account, so they are not counted above.
            </p>
          )}
          <p><Link className="btn-link" href="/accounting/owner-money">Owner money in and out</Link></p>
        </>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
