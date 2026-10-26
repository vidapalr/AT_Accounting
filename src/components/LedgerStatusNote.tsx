import Link from "next/link";
import { db } from "@/lib/db";
import { autoPostPending } from "@/lib/ledger/auto-post";
import { getSyncStatus } from "@/lib/ledger/sync-status";

/**
 * Shown on pages that list operational records (balances, sales and purchase
 * report, investor accounts): tells the reader whether the ledger has caught up,
 * so no page quietly shows numbers that disagree with the books.
 */
export default async function LedgerStatusNote({ businessId }: { businessId: number }) {
  await autoPostPending(db, businessId).catch(() => undefined);
  const sync = await getSyncStatus(db, businessId);
  const review = sync.changedAfterPosting.length + sync.noLongerValid.length + sync.problems.length;
  const ok = sync.pending.length === 0 && review === 0;

  return (
    <p
      role="status"
      className="no-print"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
        margin: "12px 0",
        padding: "10px 14px",
        borderRadius: 8,
        border: `1px solid ${ok ? "#bbf7d0" : "#fde68a"}`,
        background: ok ? "#f0fdf4" : "#fffbeb",
        color: ok ? "#166534" : "#92400e",
      }}
    >
      {ok
        ? "Books are up to date: these figures agree with the ledger."
        : `${sync.pending.length} new record(s) are not in the ledger yet${review ? ` and ${review} need review` : ""}, so these figures may differ from Reports.`}
      {!ok && (
        <Link className="btn-link btn-link-small" href="/accounting/reports">
          Open Reports to fix
        </Link>
      )}
    </p>
  );
}
