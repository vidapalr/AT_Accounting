
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/codes";
import { requireGroupOwner } from "@/lib/auth";

type ActionResult = {
  success: boolean;
  message: string;
};

type CountRow = RowDataPacket & { total: number };
type DivisionRow = RowDataPacket & {
  id: number;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

function readText(
  formData: FormData,
  key: string
): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validateDivision(
  code: string,
  name: string
): string | null {
  if (!/^[A-Z][A-Z0-9_-]{1,31}$/.test(code)) {
    return "Invalid division code.";
  }

  if (name.length < 3 || name.length > 180) {
    return "Division name must contain 3 to 180 characters.";
  }

  return null;
}

async function createDivision(
  formData: FormData
): Promise<ActionResult> {
  const user = await requireGroupOwner();

  const businessId = user.legal_business_id;
  const code = await nextCode(db, { table: "acct_divisions", column: "code", prefix: "DIV-", width: 2, where: "legal_business_id = ?", params: [businessId] });
  const name = readText(formData, "name");

  const validation = validateDivision(code, name);

  if (validation) {
    return { success: false, message: validation };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Serialize division changes within this business.
    const [businesses] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (businesses.length !== 1) {
      await connection.rollback();
      return { success: false, message: "Business not found." };
    }

    const [duplicates] = await connection.execute<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM acct_divisions
       WHERE legal_business_id = ?
         AND code = ?`,
      [businessId, code]
    );

    if (Number(duplicates[0].total) > 0) {
      await connection.rollback();
      return {
        success: false,
        message: "Division code already exists.",
      };
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO acct_divisions
       (legal_business_id, code, name, status)
       VALUES (?, ?, ?, 'ACTIVE')`,
      [businessId, code, name]
    );

    await connection.execute(
      `INSERT INTO acct_audit_events
       (legal_business_id, actor_user_id,
        action, subject_type, subject_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        user.id,
        "DIVISION_CREATED",
        "DIVISION",
        result.insertId,
        JSON.stringify({
          code,
          name,
          status: "ACTIVE",
        }),
      ]
    );

    await connection.commit();

    return {
      success: true,
      message: "Division created successfully.",
    };
  } catch (error) {
    await connection.rollback();
    console.error("Create division failed:", error);

    return {
      success: false,
      message: "Unable to create division.",
    };
  } finally {
    connection.release();
  }
}

async function updateDivision(
  formData: FormData
): Promise<ActionResult> {
  const user = await requireGroupOwner();

  const businessId = user.legal_business_id;
  const idText = readText(formData, "divisionId");
  const divisionId = Number(idText);
  const name = readText(formData, "name");
  const status = readText(formData, "status");

  if (
    !/^[1-9]\d*$/.test(idText) ||
    !Number.isSafeInteger(divisionId)
  ) {
    return { success: false, message: "Invalid division ID." };
  }

  if (name.length < 3 || name.length > 180) {
    return {
      success: false,
      message: "Division name must contain 3 to 180 characters.",
    };
  }

  if (status !== "ACTIVE" && status !== "INACTIVE") {
    return { success: false, message: "Invalid division status." };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [businesses] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (businesses.length !== 1) {
      await connection.rollback();
      return { success: false, message: "Business not found." };
    }

    const [rows] = await connection.execute<DivisionRow[]>(
      `SELECT id, code, name, status
       FROM acct_divisions
       WHERE id = ? AND legal_business_id = ?
       FOR UPDATE`,
      [divisionId, businessId]
    );

    const current = rows[0];

    if (!current) {
      await connection.rollback();
      return { success: false, message: "Division not found." };
    }

    if (current.name === name && current.status === status) {
      await connection.rollback();
      return { success: true, message: "No changes required." };
    }

    await connection.execute(
      `UPDATE acct_divisions
       SET name = ?, status = ?
       WHERE id = ? AND legal_business_id = ?`,
      [name, status, divisionId, businessId]
    );

    await connection.execute(
      `INSERT INTO acct_audit_events
       (legal_business_id, actor_user_id,
        action, subject_type, subject_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        user.id,
        "DIVISION_UPDATED",
        "DIVISION",
        divisionId,
        JSON.stringify({
          before: {
            name: current.name,
            status: current.status,
          },
          after: { name, status },
        }),
      ]
    );

    await connection.commit();

    return {
      success: true,
      message: "Division updated successfully.",
    };
  } catch (error) {
    await connection.rollback();
    console.error("Update division failed:", error);

    return {
      success: false,
      message: "Unable to update division.",
    };
  } finally {
    connection.release();
  }
}

function redirectWithResult(result: ActionResult): never {
  const params = new URLSearchParams({
    status: result.success ? "success" : "error",
    message: result.message,
  });

  redirect(`/divisions?${params.toString()}`);
}

export async function createDivisionAction(formData: FormData) {
  const result = await createDivision(formData);

  if (result.success) {
    revalidatePath("/divisions");
  }

  redirectWithResult(result);
}

export async function updateDivisionAction(formData: FormData) {
  const result = await updateDivision(formData);

  if (result.success) {
    revalidatePath("/divisions");
  }

  redirectWithResult(result);
}
