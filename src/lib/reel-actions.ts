"use server";

import type { RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { deleteMedia } from "@/lib/media-storage";

export async function removeTrackAction(form: FormData): Promise<void> {
  const user = await requireAccess("products");
  const id = Number(form.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) redirect("/accounting/catalogue/reels/music");
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT storage_key FROM acct_reel_tracks WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`, [user.legal_business_id, id]);
  if (rows[0]) {
    await db.execute(`UPDATE acct_reel_tracks SET status = 'REMOVED' WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, id]);
    await deleteMedia(String(rows[0].storage_key));
  }
  revalidatePath("/accounting/catalogue/reels/music");
  redirect("/accounting/catalogue/reels/music?removed=1");
}
