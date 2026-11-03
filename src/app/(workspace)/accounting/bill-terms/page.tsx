import { Suspense } from "react";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { currentTerms } from "@/lib/bill-terms";
import { termsLines } from "@/lib/bill-terms-text";
import { saveBillTermsAction } from "@/lib/bill-terms-actions";
import BillTerms from "@/components/BillTerms";
import RewardsGuide from "@/components/RewardsGuide";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

export default function BillTermsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const q = await searchParams;
  const body = await currentTerms(db, user.legal_business_id);
  return (
    <main className={styles.page}>
      <h1>Bill terms and conditions</h1>
      <p>These lines are printed at the foot of every bill and estimate, and on the bill link you send to customers. Each bill keeps the terms it was made with, so changing them here only affects new bills.</p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error}</p>}
      <form action={saveBillTermsAction} style={{ display: "grid", gap: 10, maxWidth: 640 }}>
        <label>One term on each line (no need to type numbers; up to 12 lines)
          <textarea name="body" rows={8} defaultValue={body} maxLength={3000} style={{ width: "100%", fontSize: 16, padding: 10 }} />
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" style={{ padding: "12px 20px", fontSize: 16 }}>Save terms</button>
          <button type="submit" name="reset" value="1" style={{ padding: "12px 20px", fontSize: 16 }}>Put back the standard two</button>
        </div>
      </form>
      <h2>How it prints</h2>
      <div style={{ maxWidth: 640, border: "1px dashed #cbd5e1", padding: 12 }}><BillTerms text={body} /></div>
      <p style={{ color: "#64748b" }}>{termsLines(body).length} terms.</p>
      <RewardsGuide open />
    </main>
  );
}
