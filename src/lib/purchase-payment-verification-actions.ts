
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { verifyPurchasePaymentCore } from "@/lib/purchase-payment-verify-core";
import { requireGroupOwner } from "@/lib/auth";

const BASE = "/accounting/purchases";

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function resultUrl(
  purchaseId: number | null,
  result: string,
  returnTo?: string
): string {
  if (returnTo === "purchase-management") {
    return `/accounting/purchase-management?result=${encodeURIComponent(result)}`;
  }

  return purchaseId
    ? `${BASE}/${purchaseId}/payments?result=${encodeURIComponent(result)}`
    : "/accounting/purchases";
}

export async function verifyPurchasePaymentAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();

  const purchaseId = parseId(form.get("purchase_id"));
  const returnTo =
    form.get("return_to") === "purchase-management"
      ? "purchase-management"
      : undefined;
  const paymentId = parseId(form.get("payment_id"));
  const confirmed =
    form.get("confirm") === "VERIFY_PAYMENT";

  if (!purchaseId || !paymentId || !confirmed) {
    redirect(resultUrl(purchaseId, "verification-invalid", returnTo));
  }

  const outcome = await verifyPurchasePaymentCore(user, purchaseId, paymentId);

  if (outcome === "verified") {
    revalidatePath(`${BASE}/${purchaseId}/payments`);
    revalidatePath(`${BASE}/${purchaseId}`);
  }

  redirect(resultUrl(purchaseId, outcome, returnTo));
}
