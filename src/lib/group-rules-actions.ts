"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { parseUnits, formatUnits } from "@/lib/investor-shares/engine";

/** Owner only. Saves the least share of the group the owner must keep (default 51%). */
export async function saveOwnerMinShareAction(formData: FormData) {
  const user = await requireGroupOwner();
  const raw = String(formData.get("owner_min") ?? "").trim().replace(/%$/, "");
  let units: number;
  try {
    units = parseUnits(raw);
  } catch {
    redirect("/accounting/group-rules?result=invalid");
  }
  if (units < 10_000 || units > 1_000_000) redirect("/accounting/group-rules?result=invalid");
  const value = formatUnits(units).replace(/%$/, "");
  await db.execute(
    `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
     VALUES (?, 'owner_min_group_percent', ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [user.legal_business_id, value, user.id]
  );
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'OWNER_MIN_SHARE_CHANGED', 'SETTING', 0, ?)`,
    [user.legal_business_id, user.id, JSON.stringify({ ownerMinPercent: value })]
  );
  revalidatePath("/accounting/group-rules");
  redirect("/accounting/group-rules?result=saved");
}
