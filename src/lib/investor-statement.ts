import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { allocate, buildSegments } from "@/lib/investor-shares/engine";
import { loadShares, profitLookupFor } from "@/lib/investor-shares/data";

type Row = RowDataPacket & Record<string, string | number | null>;
const paise = (v: unknown) => BigInt(Math.round(Number(v ?? 0) * 100));

export type InvestorStatement = {
  partyName: string;
  agreements: {
    id: number; no: string; type: string; status: string; committed: bigint; received: bigint; paidBack: bigint; returnsPaid: bigint;
    from: string; to: string | null; sharePercent: string | null; basis: string | null; payoutFrequency: string;
  }[];
  transactions: { date: string; no: string; agreementNo: string; type: string; amount: bigint; method: string }[];
  profit: { agreementNo: string; basis: string; sharePercent: string; from: string; to: string; profitBase: bigint; share: bigint }[];
  payableByAgreement: { agreementNo: string; payable: bigint }[];
};

const percent = (units: number) => `${(units / 10_000).toFixed(2).replace(/\.?0+$/, "")}%`;

/** Everything one investor may see about their own money. Never reads other investors' rows. */
export async function loadInvestorStatement(db: Pool, businessId: number, partyId: number, from: string, to: string): Promise<InvestorStatement | null> {
  const [parties] = await db.execute<Row[]>(`SELECT full_name FROM acct_funding_parties WHERE legal_business_id = ? AND id = ?`, [businessId, partyId]);
  if (!parties[0]) return null;

  const [agreements] = await db.execute<Row[]>(
    `SELECT a.id, a.agreement_no, a.funding_type, a.status, a.committed_amount, a.profit_share_percentage, a.profit_basis, a.payout_frequency,
            DATE_FORMAT(a.effective_from, '%Y-%m-%d') AS eff_from, DATE_FORMAT(a.effective_to, '%Y-%m-%d') AS eff_to,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'FUNDING_RECEIVED' THEN t.amount END), 0) AS received,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'PRINCIPAL_REPAID' THEN t.amount END), 0) AS repaid,
            COALESCE(SUM(CASE WHEN t.transaction_type = 'RETURN_PAID' THEN t.amount END), 0) AS returns_paid
       FROM acct_funding_agreements a
       LEFT JOIN acct_funding_transactions t ON t.agreement_id = a.id AND t.legal_business_id = a.legal_business_id AND t.status = 'VERIFIED'
      WHERE a.legal_business_id = ? AND a.party_id = ? AND a.status IN ('ACTIVE','CLOSED')
      GROUP BY a.id ORDER BY a.id`,
    [businessId, partyId]
  );
  const [tx] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS d, t.transaction_no, a.agreement_no, t.transaction_type, t.amount, t.payment_method
       FROM acct_funding_transactions t JOIN acct_funding_agreements a ON a.id = t.agreement_id AND a.legal_business_id = t.legal_business_id
      WHERE t.legal_business_id = ? AND a.party_id = ? AND t.status = 'VERIFIED'
      ORDER BY t.transaction_date DESC, t.id DESC LIMIT 100`,
    [businessId, partyId]
  );

  const { versions } = await loadShares(db, businessId);
  const mine = versions.filter((v) => v.partyId === partyId);
  const segments = buildSegments(mine, from, to);
  const lookup = await profitLookupFor(db, businessId, [{ from, to }, ...segments.map((s) => ({ from: s.segFrom, to: s.segTo }))]);
  const { rows, totals } = allocate(segments, lookup);

  const current = new Map<number, (typeof mine)[number]>();
  for (const v of mine) {
    const c = current.get(v.agreementId);
    if (!c || v.versionNo > c.versionNo) current.set(v.agreementId, v);
  }
  const BASIS = { GROSS: "Gross profit", OPERATING: "Operating profit", NET: "Net profit" } as const;

  return {
    partyName: String(parties[0].full_name),
    agreements: agreements.map((a) => {
      const v = current.get(Number(a.id));
      return {
        id: Number(a.id), no: String(a.agreement_no), type: a.funding_type === "LOAN" ? "Loan" : "Profit-linked", status: String(a.status),
        committed: paise(a.committed_amount), received: paise(a.received), paidBack: paise(a.repaid), returnsPaid: paise(a.returns_paid),
        from: String(a.eff_from), to: a.eff_to ? String(a.eff_to) : null,
        sharePercent: v ? percent(v.units) : a.profit_share_percentage ? `${Number(a.profit_share_percentage)}%` : null,
        basis: v ? BASIS[v.basis] : a.profit_basis ? String(a.profit_basis) : null,
        payoutFrequency: String(a.payout_frequency).replace("_", " ").toLowerCase(),
      };
    }),
    transactions: tx.map((t) => ({
      date: String(t.d), no: String(t.transaction_no), agreementNo: String(t.agreement_no),
      type: t.transaction_type === "FUNDING_RECEIVED" ? "Money you put in" : t.transaction_type === "PRINCIPAL_REPAID" ? "Capital paid back to you" : "Profit / interest paid to you",
      amount: paise(t.amount), method: String(t.payment_method).replace("_", " ").toLowerCase(),
    })),
    profit: rows.map((r) => ({
      agreementNo: r.agreementNo, basis: BASIS[r.basis], sharePercent: percent(r.units), from: r.from, to: r.to, profitBase: r.profitBase, share: r.share,
    })),
    payableByAgreement: totals.map((t) => ({ agreementNo: t.agreementNo, payable: t.payable })),
  };
}
