import "server-only";

import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/db-errors";
import { DEFAULT_TEMPLATES, type LetterTemplate, type TemplateLetterType } from "@/lib/staff-letters";

/** The company's wording for one letter, or the standard wording when it has not been changed. */
export async function loadLetterTemplate(businessId: number, type: TemplateLetterType): Promise<LetterTemplate & { custom: boolean }> {
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT heading, body, needs_acceptance FROM acct_letter_templates WHERE legal_business_id = ? AND letter_type = ?`,
      [businessId, type]
    );
    if (rows[0]) {
      return { heading: String(rows[0].heading), body: String(rows[0].body), needsAcceptance: Number(rows[0].needs_acceptance) === 1, custom: true };
    }
  } catch (error) {
    if (!isMissingTable(error)) throw error; // before migration 084: the standard wording
  }
  return { ...DEFAULT_TEMPLATES[type], custom: false };
}
