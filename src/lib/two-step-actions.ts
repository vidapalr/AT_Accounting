"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { newSecret, checkCode } from "@/lib/totp";
import { beginSetup, confirmSetup, removeTwoStep, replaceBackupCodes, hasTwoStep } from "@/lib/two-step";
import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

const PAGE = "/accounting/security";

async function me() {
  const user = await requireUser();
  if (user.role !== "GROUP_OWNER" && user.role !== "ACCOUNTANT") redirect("/dashboard");
  return user;
}

export async function startTwoStepAction() {
  const user = await me();
  await beginSetup(user.id, newSecret());
  revalidatePath(PAGE);
  redirect(PAGE);
}

/** First code from the app switches it on and shows the backup codes once. */
export async function confirmTwoStepAction(form: FormData) {
  const user = await me();
  const codes = await confirmSetup(user.id, String(form.get("code") ?? ""));
  if (!codes) redirect(`${PAGE}?error=${encodeURIComponent("That code is not right. Wait for a new code in the app and try again.")}`);
  // Shown once, in the address of the next page only through a short-lived cookie-free hand-off: render directly.
  const { cookies } = await import("next/headers");
  (await cookies()).set("abhiram_backup_codes", codes.join(","), { httpOnly: true, path: PAGE, maxAge: 120, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  redirect(PAGE);
}

async function codeIsRight(userId: number, typed: string) {
  const [r] = await db.execute<RowDataPacket[]>(`SELECT secret FROM acct_user_totp WHERE user_id = ? AND enabled_at IS NOT NULL`, [userId]);
  return !!r[0] && checkCode(String(r[0].secret), typed, Date.now()) !== null;
}

export async function turnOffTwoStepAction(form: FormData) {
  const user = await me();
  if (!(await codeIsRight(user.id, String(form.get("code") ?? "")))) {
    redirect(`${PAGE}?error=${encodeURIComponent("That code is not right, so two-step login was left on.")}`);
  }
  await removeTwoStep(user.id);
  revalidatePath(PAGE);
  redirect(`${PAGE}?done=${encodeURIComponent("Two-step login is off.")}`);
}

export async function newBackupCodesAction(form: FormData) {
  const user = await me();
  if (!(await hasTwoStep(user.id)) || !(await codeIsRight(user.id, String(form.get("code") ?? "")))) {
    redirect(`${PAGE}?error=${encodeURIComponent("That code is not right, so the backup codes were not changed.")}`);
  }
  const codes = await replaceBackupCodes(user.id);
  const { cookies } = await import("next/headers");
  (await cookies()).set("abhiram_backup_codes", codes.join(","), { httpOnly: true, path: PAGE, maxAge: 120, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  redirect(PAGE);
}
