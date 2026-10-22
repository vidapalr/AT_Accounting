
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  createHistoricalFundingBatchAction,
  addHistoricalFundingItemAction,
} from "@/lib/historical-funding-actions";

type Props = {
  searchParams: Promise<{
    batch?: string;
    result?: string;
  }>;
};

interface Batch extends RowDataPacket {
  id: number;
  batch_reference: string;
  description: string;
  status: string;
  created_at: string;
  item_count: number;
}

interface Agreement extends RowDataPacket {
  id: number;
  agreement_no: string;
  investor_name: string;
  funding_type: string;
  status: string;
}

interface Version extends RowDataPacket {
  id: number;
  agreement_id: number;
  version_no: number;
  version_status: string;
}

interface Item extends RowDataPacket {
  id: number;
  line_no: number;
  agreement_no: string;
  investor_name: string;
  version_no: number | null;
  transaction_date: string;
  transaction_type: string;
  amount: string;
  payment_method: string;
  payment_reference: string | null;
  evidence_reference: string | null;
  validation_status: string;
}

const boxStyle: React.CSSProperties = {
  border: "1px solid #d7dce4",
  borderRadius: 10,
  padding: 18,
  marginTop: 20,
};

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  marginTop: 5,
};

const cellStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

const messages: Record<string, string> = {
  "batch-created":
    "Historical funding batch created successfully.",
  "item-saved":
    "Historical funding item saved as PENDING.",
  "invalid-description":
    "Enter a batch description between 5 and 500 characters.",
  "invalid-item":
    "Check the transaction fields and amount.",
  "evidence-required":
    "Enter an evidence reference or document identifier.",
  "invalid-business":
    "The selected business is not available.",
  "batch-not-found":
    "The historical funding batch was not found.",
  "batch-locked":
    "This batch is no longer editable.",
  "opening-required":
    "Create an opening balance worksheet first.",
  "opening-posted":
    "Opening balances are posted. Historical cutover entry is locked.",
  "date-after-cutover":
    "Historical transaction date cannot exceed the opening date.",
  "agreement-invalid":
    "The agreement is not applicable on the transaction date.",
  "version-invalid":
    "Choose an approved agreement version applicable on the transaction date.",
  "possible-duplicate":
    "A transaction with the same payment reference already exists. Review it before saving.",
  "line-limit":
    "The batch has reached its supported line limit.",
  failed:
    "Saving failed. Review the application server logs.",
};

function paise(value: string): bigint {
  const [whole, decimal = ""] = String(value).split(".");
  return BigInt(whole) * 100n +
    BigInt(decimal.padEnd(2, "0"));
}

function rupees(value: bigint): string {
  const negative = value < 0n;
  const n = negative ? -value : value;
  return `${negative ? "-" : ""}₹${n / 100n}.` +
    String(n % 100n).padStart(2, "0");
}

async function HistoricalFundingContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const [batchRows] = await db.execute<Batch[]>(
    `SELECT
       b.id,
       b.batch_reference,
       b.description,
       b.status,
       DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i')
         AS created_at,
       COUNT(i.id) AS item_count
     FROM acct_historical_funding_batches b
     LEFT JOIN acct_historical_funding_items i
       ON i.legal_business_id = b.legal_business_id
      AND i.batch_id = b.id
     WHERE b.legal_business_id = ?
     GROUP BY
       b.id,
       b.batch_reference,
       b.description,
       b.status,
       b.created_at
     ORDER BY b.id DESC`,
    [businessId]
  );

  const requestedBatch = Number(query.batch);
  const selectedBatch = batchRows.find(
    (b) => Number(b.id) === requestedBatch
  ) ?? batchRows[0] ?? null;

  const [openingRows] = await db.execute<RowDataPacket[]>(
    `SELECT
       status,
       DATE_FORMAT(opening_date, '%Y-%m-%d')
         AS opening_date
     FROM acct_opening_balance_batches
     WHERE legal_business_id = ?
     LIMIT 1`,
    [businessId]
  );

  const opening = openingRows[0] ?? null;

  const [agreements] = await db.execute<Agreement[]>(
    `SELECT
       a.id,
       a.agreement_no,
       p.full_name AS investor_name,
       a.funding_type,
       a.status
     FROM acct_funding_agreements a
     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id
     WHERE a.legal_business_id = ?
     ORDER BY a.agreement_no`,
    [businessId]
  );

  const [versions] = await db.execute<Version[]>(
    `SELECT
       id,
       agreement_id,
       version_no,
       version_status
     FROM acct_agreement_versions
     WHERE legal_business_id = ?
       AND version_status IN ('APPROVED', 'SUPERSEDED')
     ORDER BY agreement_id, version_no DESC`,
    [businessId]
  );

  let items: Item[] = [];

  if (selectedBatch) {
    const [saved] = await db.execute<Item[]>(
      `SELECT
         i.id,
         i.line_no,
         a.agreement_no,
         p.full_name AS investor_name,
         v.version_no,
         DATE_FORMAT(i.transaction_date, '%Y-%m-%d')
           AS transaction_date,
         i.transaction_type,
         CAST(i.amount AS CHAR) AS amount,
         i.payment_method,
         i.payment_reference,
         i.evidence_reference,
         i.validation_status
       FROM acct_historical_funding_items i
       JOIN acct_funding_agreements a
         ON a.id = i.agreement_id
        AND a.legal_business_id = i.legal_business_id
       JOIN acct_funding_parties p
         ON p.id = a.party_id
        AND p.legal_business_id = a.legal_business_id
       LEFT JOIN acct_agreement_versions v
         ON v.id = i.agreement_version_id
        AND v.legal_business_id = i.legal_business_id
       WHERE i.legal_business_id = ?
         AND i.batch_id = ?
       ORDER BY i.line_no`,
      [businessId, selectedBatch.id]
    );

    items = saved;
  }

  const totals = items.reduce(
    (acc, item) => {
      const amount = paise(item.amount);

      if (item.transaction_type === "FUNDING_RECEIVED") {
        acc.received += amount;
      } else if (
        item.transaction_type === "PRINCIPAL_REPAID"
      ) {
        acc.repaid += amount;
      } else if (
        item.transaction_type === "RETURN_PAID"
      ) {
        acc.returns += amount;
      }

      return acc;
    },
    { received: 0n, repaid: 0n, returns: 0n }
  );

  const canEnter =
    selectedBatch?.status === "DRAFT" &&
    opening?.status === "DRAFT";

  return (
    <main style={{
      maxWidth: 1450,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link href="/accounting/cutover-reconciliation">
        ← Cutover Reconciliation
      </Link>

      <h1>Historical Funding Entry</h1>

      <p>
        Register pre-cutover investor funding and
        repayments for review. Draft entries do not
        affect the General Ledger.
      </p>

      {query.result && (
        <p role="status" style={boxStyle}>
          {messages[query.result] ?? "Request completed."}
        </p>
      )}

      <section style={boxStyle}>
        <h2>Create Historical Funding Batch</h2>

        <form action={createHistoricalFundingBatchAction}>
          <label>
            Batch Description
            <input
              name="description"
              required
              minLength={5}
              maxLength={500}
              placeholder="Historical investor funding before opening date"
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            style={{ marginTop: 14, padding: 11 }}
          >
            Create Batch
          </button>
        </form>
      </section>

      <section style={boxStyle}>
        <h2>Funding Batches</h2>

        {batchRows.length === 0 ? (
          <p>No historical funding batches created.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
            }}>
              <thead>
                <tr>
                  {[
                    "Reference",
                    "Description",
                    "Status",
                    "Items",
                    "Created",
                  ].map((heading) => (
                    <th key={heading} style={cellStyle}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {batchRows.map((batch) => (
                  <tr key={batch.id}>
                    <td style={cellStyle}>
                      <Link
                        href={`/accounting/historical-funding?batch=${batch.id}`}
                      >
                        {batch.batch_reference}
                      </Link>
                    </td>

                    <td style={cellStyle}>
                      {batch.description}
                    </td>

                    <td style={cellStyle}>
                      {batch.status}
                    </td>

                    <td style={cellStyle}>
                      {batch.item_count}
                    </td>

                    <td style={cellStyle}>
                      {batch.created_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedBatch && (
        <>
          <section style={boxStyle}>
            <h2>
              Enter Transactions —{" "}
              {selectedBatch.batch_reference}
            </h2>

            <p>
              Status: <strong>{selectedBatch.status}</strong>
              {" | "}
              Cutover date:{" "}
              <strong>
                {opening?.opening_date ?? "Not configured"}
              </strong>
            </p>

            {!canEnter ? (
              <p>
                Entry is unavailable because the batch
                or opening worksheet is not in DRAFT status.
              </p>
            ) : (
              <form
                action={addHistoricalFundingItemAction}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 14,
                }}
              >
                <input
                  type="hidden"
                  name="batch_id"
                  value={selectedBatch.id}
                />

                <label>
                  Investor Funding Agreement
                  <select
                    name="agreement_id"
                    required
                    defaultValue=""
                    style={inputStyle}
                  >
                    <option value="">
                      Select Agreement
                    </option>
                    {agreements.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.agreement_no} —{" "}
                        {a.investor_name}
                        {" ("}{a.funding_type}{")"}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Agreement Version
                  <select
                    name="agreement_version_id"
                    required
                    defaultValue=""
                    style={inputStyle}
                  >
                    <option value="">
                      Select Version
                    </option>
                    {versions.map((v) => {
                      const agreement =
                        agreements.find(
                          (a) =>
                            Number(a.id) ===
                            Number(v.agreement_id)
                        );

                      return (
                        <option key={v.id} value={v.id}>
                          {agreement?.agreement_no ??
                            `Agreement ${v.agreement_id}`}
                          {" — V"}{v.version_no}
                          {" ("}{v.version_status}{")"}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <label>
                  Original Transaction Date
                  <input
                    type="date"
                    name="transaction_date"
                    required
                    max={opening.opening_date}
                    style={inputStyle}
                  />
                </label>

                <label>
                  Transaction Type
                  <select
                    name="transaction_type"
                    required
                    defaultValue=""
                    style={inputStyle}
                  >
                    <option value="">Select Type</option>
                    <option value="FUNDING_RECEIVED">
                      Funding Received
                    </option>
                    <option value="PRINCIPAL_REPAID">
                      Principal Repaid
                    </option>
                    <option value="RETURN_PAID">
                      Return / Profit Paid
                    </option>
                  </select>
                </label>

                <label>
                  Amount (₹)
                  <input
                    type="text"
                    name="amount"
                    required
                    inputMode="decimal"
                    placeholder="200000.00"
                    style={inputStyle}
                  />
                </label>

                <label>
                  Payment Method
                  <select
                    name="payment_method"
                    required
                    defaultValue=""
                    style={inputStyle}
                  >
                    <option value="">
                      Select Payment Method
                    </option>
                    <option value="BANK_TRANSFER">
                      Bank Transfer
                    </option>
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>

                <label>
                  Payment Reference
                  <input
                    name="payment_reference"
                    maxLength={120}
                    placeholder="UTR / Cheque No. / Receipt No."
                    style={inputStyle}
                  />
                </label>

                <label>
                  Evidence Reference
                  <input
                    name="evidence_reference"
                    required
                    maxLength={255}
                    placeholder="Statement page / document reference"
                    style={inputStyle}
                  />
                </label>

                <label style={{ gridColumn: "1 / -1" }}>
                  Remarks
                  <textarea
                    name="remarks"
                    maxLength={500}
                    rows={3}
                    placeholder="Historical transaction details"
                    style={inputStyle}
                  />
                </label>

                <div style={{ gridColumn: "1 / -1" }}>
                  <button
                    type="submit"
                    style={{ padding: "12px 20px" }}
                  >
                    Save Historical Transaction
                  </button>
                </div>
              </form>
            )}
          </section>

          <section style={boxStyle}>
            <h2>Draft Funding Summary</h2>

            <p>
              Funding received:{" "}
              <strong>{rupees(totals.received)}</strong>
            </p>
            <p>
              Principal repaid:{" "}
              <strong>{rupees(totals.repaid)}</strong>
            </p>
            <p>
              Draft outstanding principal:{" "}
              <strong>
                {rupees(totals.received - totals.repaid)}
              </strong>
            </p>
            <p>
              Returns paid separately:{" "}
              <strong>{rupees(totals.returns)}</strong>
            </p>

            <p>
              These totals include staged draft entries
              only. They are not verified funding balances
              or accounting ledger balances.
            </p>
          </section>

          <section style={boxStyle}>
            <h2>Saved Historical Transactions</h2>

            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
              }}>
                <thead>
                  <tr>
                    {[
                      "#",
                      "Agreement",
                      "Investor",
                      "Version",
                      "Date",
                      "Type",
                      "Amount",
                      "Method",
                      "Payment Reference",
                      "Evidence",
                      "Validation",
                    ].map((heading) => (
                      <th key={heading} style={cellStyle}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td style={cellStyle}>
                        {item.line_no}
                      </td>
                      <td style={cellStyle}>
                        {item.agreement_no}
                      </td>
                      <td style={cellStyle}>
                        {item.investor_name}
                      </td>
                      <td style={cellStyle}>
                        {item.version_no === null
                          ? "—"
                          : `V${item.version_no}`}
                      </td>
                      <td style={cellStyle}>
                        {item.transaction_date}
                      </td>
                      <td style={cellStyle}>
                        {item.transaction_type}
                      </td>
                      <td style={cellStyle}>
                        {rupees(paise(item.amount))}
                      </td>
                      <td style={cellStyle}>
                        {item.payment_method}
                      </td>
                      <td style={cellStyle}>
                        {item.payment_reference ?? "—"}
                      </td>
                      <td style={cellStyle}>
                        {item.evidence_reference ?? "—"}
                      </td>
                      <td style={cellStyle}>
                        {item.validation_status}
                      </td>
                    </tr>
                  ))}

                  {items.length === 0 && (
                    <tr>
                      <td colSpan={11} style={cellStyle}>
                        No historical transactions entered
                        in this batch.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function HistoricalFundingPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Historical Funding Entry</h1>
          <p>Loading historical funding records…</p>
        </main>
      }
    >
      <HistoricalFundingContent {...props} />
    </Suspense>
  );
}
