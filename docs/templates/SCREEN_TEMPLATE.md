# Screen template

Every staff screen follows the same shape, so pages look alike and the logic can later be reused by the mobile app.

## Files

| File | What goes in it |
| --- | --- |
| `src/app/(workspace)/accounting/<screen>/page.tsx` | The page: reads data, shows it. No business rules. |
| `src/lib/<screen>-actions.ts` | `"use server"` actions: check access, validate, save in a transaction, audit, redirect with `?result=`. |
| `src/lib/<screen>-math.ts` | Pure rules and calculations (no database). Unit-tested. |
| `tests/<screen>-math.test.mjs` | Tests for the pure rules. |
| `src/lib/navigation.ts` | One menu line under the right header. |
| `src/lib/access.ts` | The path prefix mapped to a feature (otherwise owner only). |

## Page skeleton

```tsx
import { Suspense } from "react";

import { requireAccess } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { PageHeader, ResultNotice, Section, Field, EmptyState } from "@/components/ui";
import { bigButton, fieldFull, formGrid } from "@/lib/ui/styles";
import { inr2 } from "@/lib/format";
import { saveThingAction } from "@/lib/thing-actions";

type Props = { searchParams: Promise<{ result?: string }> };

const MESSAGES = {
  saved: { tone: "ok", text: "Saved." },
  invalid: { tone: "error", text: "Please check the amount." },
} as const;

async function Content({ searchParams }: Props) {
  const user = await requireAccess("feature");         // 1. who may open it
  const businessId = user.legal_business_id;            // 2. always the signed-in company
  const q = await searchParams;
  // 3. read data (queries always filter by legal_business_id)

  return (
    <main style={{ maxWidth: 980 }}>
      <PageHeader title="Plain title" intro="One line saying what this page is for." />
      <ResultNotice result={q.result} messages={MESSAGES} />
      <Section title="Add">
        <form action={saveThingAction} style={formGrid}>
          <Field label="Amount"><input name="amount" inputMode="decimal" required style={fieldFull} /></Field>
          <button type="submit" className="btn-link btn-link-primary" style={bigButton}>Save</button>
        </form>
      </Section>
      {/* list, or <EmptyState>Nothing yet.</EmptyState> */}
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
```

## Action skeleton

```ts
"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

const PAGE = "/accounting/<screen>";

export async function saveThingAction(form: FormData): Promise<void> {
  const user = await requireAccess("feature");
  // validate with the pure helper; on a problem: redirect(`${PAGE}?result=invalid`)
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // writes, all with legal_business_id = user.legal_business_id
    // audit: INSERT INTO acct_audit_events (...)
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=saved`);
}
```

The working example of this template is `src/app/(workspace)/accounting/letter-templates/page.tsx`.
