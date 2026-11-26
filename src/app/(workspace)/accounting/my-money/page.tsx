import { Suspense } from "react";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { loadPersonalMoney, ACCOUNT_KIND_WORDS, type PersonalAccount } from "@/lib/personal-money-data";
import { setPersonalLoanStatusAction, updatePersonalInvestmentAction, voidPersonalEntryAction } from "@/lib/personal-money-actions";
import { ENTRY_WORDS } from "@/lib/personal-money";
import { inr, todayInIndia } from "@/lib/reports/money";
import { cellTopCompact as cell, fieldFull as field, muted } from "@/lib/ui/styles";
import { Badge, EmptyState, Notice, PageHeader, Section, StatTile, Tabs } from "@/components/ui";
import ConfirmButton from "@/components/ConfirmButton";
import SubmitButton from "@/components/SubmitButton";
import {
  AccountForm, EntryForm, InvestmentForm, InvestmentMoveForm, LoanForm, LoanPaymentForm, INVESTMENT_KIND_WORDS,
} from "@/components/PersonalMoneyForms";

type Props = { searchParams: Promise<{ tab?: string; account?: string; edit?: string; saved?: string; error?: string }> };

const PAGE = "/accounting/my-money";
const right: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
const tiles: React.CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", margin: "12px 0" };
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const signed = (p: bigint) => <span style={{ color: p < 0n ? "#b91c1c" : "#166534" }}>{p < 0n ? "−" : "+"}{inr(p < 0n ? -p : p)}</span>;

function accountLine(a: PersonalAccount) {
  const bits = [ACCOUNT_KIND_WORDS[a.kind], a.bankName, a.last4 ? `•••• ${a.last4}` : null].filter(Boolean);
  return bits.join(" · ");
}

function balanceText(a: PersonalAccount) {
  if (a.card) return a.card.owed > 0n ? <>Owed <strong>{inr(a.card.owed)}</strong></> : <>Nothing owed{a.balance > 0n ? <> (in credit {inr(a.balance)})</> : null}</>;
  return <strong style={{ color: a.balance < 0n ? "#b91c1c" : undefined }}>{inr(a.balance)}</strong>;
}

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const q = await searchParams;
  const today = todayInIndia();
  const data = await loadPersonalMoney(db, user.legal_business_id, user.id, today);
  const tab = ["overview", "accounts", "spending", "loans", "investments"].includes(q.tab ?? "") ? q.tab! : "overview";
  const opts = data.accounts.map((a) => ({ id: a.id, name: a.name }));
  const accountNames = new Map(data.accounts.map((a) => [a.id, a.name]));

  const header = (
    <PageHeader title="My money" intro="Your personal accounts, cards, spending, loans and investments. Only you can see this page; nothing here goes into the business books." />
  );
  if (!data.ready) {
    return <main style={{ padding: 16, maxWidth: 1000 }}>{header}<Notice tone="warn">This page needs the new database step <strong>098_personal_money</strong>. Paste it in the phpMyAdmin SQL tab, then reload.</Notice></main>;
  }

  const open = data.accounts.find((a) => String(a.id) === q.account);
  const editing = data.accounts.find((a) => String(a.id) === q.edit);
  const cardsDue = data.accounts.filter((a) => a.card && a.card.owed > 0n && a.card.nextDue).sort((a, b) => a.card!.nextDue!.localeCompare(b.card!.nextDue!));
  const emisDue = data.loans.filter((l) => l.status === "OPEN" && l.direction === "TAKEN" && l.emi && l.emiDay);

  return (
    <main style={{ padding: 16, maxWidth: 1000 }}>
      {header}
      {q.saved && <Notice tone="ok">{q.saved.slice(0, 300)}</Notice>}
      {q.error && <Notice tone="error">{q.error.slice(0, 300)}</Notice>}

      <Tabs base={PAGE} current={tab} tabs={[
        { key: "overview", label: "Overview" },
        { key: "accounts", label: "Accounts and cards", count: data.accounts.length },
        { key: "spending", label: "Money in and spent" },
        { key: "loans", label: "Loans and EMIs", count: data.loans.filter((l) => l.status === "OPEN").length },
        { key: "investments", label: "Investments", count: data.investments.filter((i) => i.status === "ACTIVE").length },
      ]} />

      {tab === "overview" && (
        <>
          <div style={tiles}>
            <StatTile label="What I own, less what I owe" value={inr(data.totals.netWorth)} note="Accounts + loans given + investments − loans taken" />
            <StatTile label="In my accounts" value={inr(data.totals.accounts + data.totals.cardsOwed)} note={data.totals.cardsOwed > 0n ? `Cards owed ${inr(data.totals.cardsOwed)}` : "Bank, cash and wallets"} />
            <StatTile label="Loans I owe" value={inr(data.totals.loansTaken)} />
            <StatTile label="Lent to others" value={inr(data.totals.loansGiven)} />
            <StatTile label="Investments (today's value)" value={inr(data.totals.investments)} />
          </div>
          <div style={tiles}>
            <StatTile label="Money in this month" value={inr(data.month.income)} />
            <StatTile label="Spent this month" value={inr(data.month.expense)} note={data.month.byCategory.slice(0, 3).map((c) => `${c.category} ${inr(c.amount)}`).join(" · ") || undefined} />
          </div>

          {(cardsDue.length > 0 || emisDue.length > 0) && (
            <Section title="Coming up">
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                {cardsDue.map((a) => <li key={`c${a.id}`}>{a.name}: pay {inr(a.card!.owed)} by {pretty(a.card!.nextDue!)}</li>)}
                {emisDue.map((l) => <li key={`l${l.id}`}>EMI {inr(l.emi!)} to {l.party} on day {l.emiDay} of each month</li>)}
              </ul>
            </Section>
          )}

          {data.accounts.length === 0 ? (
            <EmptyState action={<Link className="btn-link btn-link-primary" href={`${PAGE}?tab=accounts`}>Add my first account</Link>}>Start by adding your bank accounts, credit cards and cash.</EmptyState>
          ) : (
            <>
              <Section title="Spent">
                <EntryForm kind="EXPENSE" accounts={opts} today={today} tab="overview" />
              </Section>
              <Section title="Money in">
                <EntryForm kind="INCOME" accounts={opts} today={today} tab="overview" />
              </Section>
            </>
          )}
        </>
      )}

      {tab === "accounts" && !open && (
        <>
          {data.accounts.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520, marginTop: 12 }}>
                <thead><tr><th style={cell}>Account</th><th style={right}>Balance</th><th style={cell}>Card</th><th style={cell}></th></tr></thead>
                <tbody>
                  {data.accounts.map((a) => (
                    <tr key={a.id}>
                      <td style={cell}><Link href={`${PAGE}?tab=accounts&account=${a.id}`}><strong>{a.name}</strong></Link><div style={muted}>{accountLine(a)}</div></td>
                      <td style={right}>{balanceText(a)}</td>
                      <td style={cell}>{a.card ? (
                        <span style={muted}>
                          {a.card.available !== null ? <>Can still spend {inr(a.card.available)}<br /></> : null}
                          {a.card.nextDue ? <>Next due {pretty(a.card.nextDue)}</> : null}
                        </span>
                      ) : null}</td>
                      <td style={cell}><Link className="btn-link" href={`${PAGE}?tab=accounts&account=${a.id}`}>Statement</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Section title="Move money between my accounts, or pay a card bill">
            {opts.length < 2 ? <p style={muted}>Add at least two accounts first.</p> : <EntryForm kind="TRANSFER" accounts={opts} today={today} tab="accounts" />}
          </Section>
          <Section title={editing ? `Change ${editing.name}` : "Add an account or card"}>
            <AccountForm key={editing?.id ?? "new"} account={editing} today={today} />
          </Section>
        </>
      )}

      {tab === "accounts" && open && (() => {
        const lines = data.statements.get(open.id) ?? [];
        return (
          <>
            <p><Link className="btn-link" href={`${PAGE}?tab=accounts`}>← All accounts</Link></p>
            <h2 style={{ marginBottom: 4 }}>{open.name}</h2>
            <p style={{ ...muted, marginTop: 0 }}>{accountLine(open)}</p>
            <div style={tiles}>
              <StatTile label={open.card ? "Owed on the card" : "Balance now"} value={open.card ? inr(open.card.owed) : inr(open.balance)} />
              {open.card?.available != null && <StatTile label="Can still spend" value={inr(open.card.available)} />}
              {open.card?.nextDue && <StatTile label="Next payment due" value={pretty(open.card.nextDue)} />}
              <StatTile label="Start" value={inr(open.openingBalance)} note={open.openingDate ? pretty(open.openingDate) : undefined} />
            </div>
            <Section title="Spent from this account">
              <EntryForm kind="EXPENSE" accounts={opts} today={today} tab="accounts" defaultAccount={open.id} />
            </Section>
            <Section title="Statement" aside={<Link className="btn-link" href={`${PAGE}?tab=accounts&edit=${open.id}`}>Change account details</Link>}>
              {lines.length === 0 ? <p style={muted}>Nothing recorded yet.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                    <thead><tr><th style={cell}>Date</th><th style={cell}>What</th><th style={right}>Amount</th><th style={right}>Balance</th><th style={cell}></th></tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i}>
                          <td style={cell}>{pretty(l.date)}</td>
                          <td style={cell}>{l.label}{l.fromBusiness ? <> <Badge tone="info" title="Recorded in the business; change it there">Business</Badge></> : null}</td>
                          <td style={right}>{signed(l.amount)}</td>
                          <td style={right}>{inr(l.balance)}</td>
                          <td style={cell}>{l.entryId ? (
                            <form action={voidPersonalEntryAction}>
                              <input type="hidden" name="id" value={l.entryId} /><input type="hidden" name="tab" value="accounts" /><input type="hidden" name="account" value={open.id} />
                              <ConfirmButton label="Remove" question="Remove this entry? The balance will be recalculated." />
                            </form>
                          ) : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        );
      })()}

      {tab === "spending" && (
        <>
          {opts.length === 0 ? <Notice>Add an account first on <Link href={`${PAGE}?tab=accounts`}>Accounts and cards</Link>.</Notice> : (
            <>
              <Section title="Spent"><EntryForm kind="EXPENSE" accounts={opts} today={today} tab="spending" /></Section>
              <Section title="Money in"><EntryForm kind="INCOME" accounts={opts} today={today} tab="spending" /></Section>
            </>
          )}
          {data.month.byCategory.length > 0 && (
            <Section title="Spent this month by kind">
              <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 480 }}>
                <tbody>{data.month.byCategory.map((c) => <tr key={c.category}><td style={cell}>{c.category}</td><td style={right}>{inr(c.amount)}</td></tr>)}</tbody>
              </table>
            </Section>
          )}
          <Section title="Recent entries">
            {data.entries.length === 0 ? <p style={muted}>Nothing recorded yet.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead><tr><th style={cell}>Date</th><th style={cell}>What</th><th style={cell}>Account</th><th style={right}>Amount</th><th style={cell}></th></tr></thead>
                  <tbody>
                    {data.entries.slice(0, 100).map((e) => (
                      <tr key={e.id}>
                        <td style={cell}>{pretty(e.date)}</td>
                        <td style={cell}>{ENTRY_WORDS[e.kind]}{e.category ? `: ${e.category}` : ""}{e.note ? <div style={muted}>{e.note}</div> : null}</td>
                        <td style={cell}>{accountNames.get(e.accountId ?? 0) ?? ""}{e.toAccountId ? ` → ${accountNames.get(e.toAccountId) ?? ""}` : ""}</td>
                        <td style={right}>{inr(e.amount)}</td>
                        <td style={cell}>
                          <form action={voidPersonalEntryAction}>
                            <input type="hidden" name="id" value={e.id} /><input type="hidden" name="tab" value="spending" />
                            <ConfirmButton label="Remove" question="Remove this entry? Balances will be recalculated." />
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      {tab === "loans" && (
        <>
          {data.loans.length === 0 && <p style={muted}>No loans yet.</p>}
          {data.loans.map((l) => (
            <Section key={l.id} title={`${l.direction === "TAKEN" ? "Borrowed from" : "Lent to"} ${l.party}`}
              aside={l.status === "CLOSED" ? <Badge>Closed</Badge> : l.outstanding <= 0n ? <Badge tone="ok">Fully repaid</Badge> : <Badge tone="wait">{l.direction === "TAKEN" ? "I owe" : "Owed to me"}</Badge>}>
              <div style={tiles}>
                <StatTile label={l.direction === "TAKEN" ? "Still to pay" : "Still to get back"} value={inr(l.outstanding > 0n ? l.outstanding : 0n)} />
                <StatTile label={l.direction === "TAKEN" ? "Repaid so far" : "Received back"} value={inr(l.principalBack)} note={l.interestPaid > 0n ? `Plus interest ${inr(l.interestPaid)}` : undefined} />
                {l.emi && <StatTile label="EMI" value={inr(l.emi)} note={[l.emiDay ? `Day ${l.emiDay}` : null, l.interestRate ? `${l.interestRate}% a year` : null].filter(Boolean).join(" · ") || undefined} />}
                <StatTile label="Started" value={pretty(l.startDate)} note={l.endDate ? `Ends ${pretty(l.endDate)}` : undefined} />
              </div>
              {l.note && <p style={muted}>{l.note}</p>}
              {l.status === "OPEN" && opts.length > 0 && <LoanPaymentForm loanId={l.id} direction={l.direction} accounts={opts} today={today} emi={l.emi} />}
              <form action={setPersonalLoanStatusAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value={l.status === "OPEN" ? "CLOSED" : "OPEN"} />
                <SubmitButton className="btn-link" label={l.status === "OPEN" ? "Mark closed" : "Open again"} />
              </form>
            </Section>
          ))}
          <Section title="Add a loan"><LoanForm accounts={opts} today={today} /></Section>
        </>
      )}

      {tab === "investments" && (
        <>
          {data.investments.length === 0 && <p style={muted}>No investments yet.</p>}
          {data.investments.map((i) => (
            <Section key={i.id} title={i.name} aside={i.status === "CLOSED" ? <Badge>Closed</Badge> : <Badge tone="info">{INVESTMENT_KIND_WORDS[i.kind] ?? i.kind}</Badge>}>
              <div style={tiles}>
                <StatTile label="Put in" value={inr(i.invested)} />
                <StatTile label="Value today" value={inr(i.value)} note={i.valueOn ? `Updated ${pretty(i.valueOn)}` : "Same as put in, until you update it"} />
                <StatTile label={i.gain < 0n ? "Loss" : "Gain"} value={inr(i.gain < 0n ? -i.gain : i.gain)} />
                {i.maturityDate && <StatTile label="Matures" value={pretty(i.maturityDate)} />}
              </div>
              {i.status === "ACTIVE" && (
                <>
                  <form action={updatePersonalInvestmentAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
                    <input type="hidden" name="id" value={i.id} />
                    <label style={{ display: "grid", gap: 4 }}><span style={{ fontWeight: 600 }}>Value today (₹)</span><input name="current_value" inputMode="decimal" required style={{ ...field, width: 180 }} /></label>
                    <SubmitButton label="Update value" />
                  </form>
                  {opts.length > 0 && <InvestmentMoveForm investmentId={i.id} accounts={opts} today={today} />}
                </>
              )}
              <form action={updatePersonalInvestmentAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value={i.status === "ACTIVE" ? "CLOSED" : "ACTIVE"} />
                <SubmitButton className="btn-link" label={i.status === "ACTIVE" ? "Mark closed" : "Open again"} />
              </form>
            </Section>
          ))}
          <Section title="Add an investment"><InvestmentForm accounts={opts} today={today} /></Section>
        </>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
