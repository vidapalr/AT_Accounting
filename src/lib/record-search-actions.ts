"use server";

import { requireUser } from "@/lib/auth";
import { searchRecords, type RecordHit } from "@/lib/record-search";

export async function searchRecordsAction(q: string): Promise<RecordHit[]> {
  const user = await requireUser();
  return searchRecords(user, String(q ?? ""));
}
