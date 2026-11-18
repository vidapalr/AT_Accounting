import { Suspense } from "react";

import { requireAccess } from "@/lib/auth";
import { assistantReady } from "@/lib/ai/assistant";
import AssistantChat from "@/components/AssistantChat";
import { Notice, PageHeader } from "@/components/ui";

async function Content() {
  await requireAccess("reports");
  return (
    <main style={{ maxWidth: 900 }}>
      <PageHeader
        title="Ask about your business"
        intro="Ask in plain words about sales, products, stock, profit, expenses and dues. The assistant only reads your figures; it never changes, posts or sends anything."
      />
      {assistantReady() ? (
        <AssistantChat />
      ) : (
        <Notice tone="info">
          The assistant is not switched on yet. Add an Anthropic API key as <code>ANTHROPIC_API_KEY</code> in the hosting
          environment settings, then redeploy. Each question costs a small amount on that API account.
        </Notice>
      )}
    </main>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={<main>Loading…</main>}>
      <Content />
    </Suspense>
  );
}
