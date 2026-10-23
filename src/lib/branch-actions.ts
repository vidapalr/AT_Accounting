
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/codes";
import { requireGroupOwner } from "@/lib/auth";

interface BranchRow extends RowDataPacket {
  id: number;
  division_id: number;
  branch_code: string;
  status: "ACTIVE" | "INACTIVE";
}

type BranchInput = {
  branchName: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  openedOn: string | null;
};

function read(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validId(value: string): boolean {
  return (
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function validateInput(form: FormData): BranchInput | null {
  const branchName = read(form, "branch_name");
  const addressLine1 = read(form, "address_line1");
  const addressLine2 = read(form, "address_line2");
  const city = read(form, "city");
  const state = read(form, "state");
  const postalCode = read(form, "postal_code");
  const openedOn = read(form, "opened_on");

  if (
    branchName.length < 3 ||
    branchName.length > 180 ||
    addressLine1.length > 255 ||
    addressLine2.length > 255 ||
    city.length > 100 ||
    state.length > 100 ||
    (postalCode !== "" &&
      !/^[0-9A-Za-z -]{3,12}$/.test(postalCode)) ||
    (openedOn !== "" && !validDate(openedOn))
  ) {
    return null;
  }

  return {
    branchName,
    addressLine1: addressLine1 || null,
    addressLine2: addressLine2 || null,
    city: city || null,
    state: state || null,
    postalCode: postalCode || null,
    openedOn: openedOn || null,
  };
}

export async function createBranchAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const divisionText = read(form, "division_id");
  const branchCode = await nextCode(db, { table: "acct_branches", column: "branch_code", prefix: "BR-", width: 3, where: "legal_business_id = ?", params: [businessId] });
  const data = validateInput(form);

  if (
    !validId(divisionText) ||
    !/^[A-Z][A-Z0-9_-]{1,31}$/.test(branchCode) ||
    !data
  ) {
    redirect("/branches?result=invalid");
  }

  const divisionId = Number(divisionText);
  const connection = await db.getConnection();
  let outcome = "failed";

  try {
    await connection.beginTransaction();

    // Lock the parent division to serialize branch creation.
    const [divisions] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_divisions
       WHERE id = ?
         AND legal_business_id = ?
         AND status = 'ACTIVE'
       FOR UPDATE`,
      [divisionId, businessId]
    );

    if (divisions.length === 0) {
      outcome = "invalid-division";
    } else {
      const [duplicates] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_branches
           WHERE legal_business_id = ?
             AND division_id = ?
             AND branch_code = ?
           LIMIT 1`,
          [businessId, divisionId, branchCode]
        );

      if (duplicates.length > 0) {
        outcome = "duplicate";
      } else {
        const [result] =
          await connection.execute<ResultSetHeader>(
            `INSERT INTO acct_branches
             (
               legal_business_id,
               division_id,
               branch_code,
               branch_name,
               address_line1,
               address_line2,
               city,
               state,
               postal_code,
               opened_on,
               status
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
            [
              businessId,
              divisionId,
              branchCode,
              data.branchName,
              data.addressLine1,
              data.addressLine2,
              data.city,
              data.state,
              data.postalCode,
              data.openedOn,
            ]
          );

        await connection.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id,
             actor_user_id,
             action,
             subject_type,
             subject_id,
             details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            user.id,
            "BRANCH_CREATED",
            "BRANCH",
            result.insertId,
            JSON.stringify({
              division_id: divisionId,
              branch_code: branchCode,
              branch_name: data.branchName,
              status: "ACTIVE",
            }),
          ]
        );

        await connection.commit();
        outcome = "created";
      }
    }

    if (outcome !== "created") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback();
    console.error("Branch creation failed:", error);
  } finally {
    connection.release();
  }

  if (outcome === "created") {
    revalidatePath("/branches");
  }

  redirect(`/branches?result=${outcome}`);
}

export async function updateBranchAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const idText = read(form, "branch_id");
  const status = read(form, "status");
  const data = validateInput(form);

  if (
    !validId(idText) ||
    !["ACTIVE", "INACTIVE"].includes(status) ||
    !data
  ) {
    redirect("/branches?result=invalid");
  }

  const branchId = Number(idText);
  const connection = await db.getConnection();
  let outcome = "failed";

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<BranchRow[]>(
      `SELECT
         id,
         division_id,
         branch_code,
         status
       FROM acct_branches
       WHERE id = ?
         AND legal_business_id = ?
       FOR UPDATE`,
      [branchId, businessId]
    );

    const before = rows[0];

    if (!before) {
      outcome = "not-found";
    } else {
      // A branch cannot be activated under an inactive division.
      if (status === "ACTIVE") {
        const [divisions] =
          await connection.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_divisions
             WHERE id = ?
               AND legal_business_id = ?
               AND status = 'ACTIVE'`,
            [before.division_id, businessId]
          );

        if (divisions.length === 0) {
          outcome = "inactive-division";
        }
      }

      if (status === "INACTIVE") {
        const [agreements] =
          await connection.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_funding_agreements
             WHERE legal_business_id = ?
               AND branch_id = ?
               AND status IN ('DRAFT', 'ACTIVE')
             LIMIT 1`,
            [businessId, branchId]
          );

        if (agreements.length > 0) {
          outcome = "open-agreements";
        }
      }

      if (outcome === "failed") {
        await connection.execute(
          `UPDATE acct_branches
           SET branch_name = ?,
               address_line1 = ?,
               address_line2 = ?,
               city = ?,
               state = ?,
               postal_code = ?,
               opened_on = ?,
               status = ?
           WHERE id = ?
             AND legal_business_id = ?`,
          [
            data.branchName,
            data.addressLine1,
            data.addressLine2,
            data.city,
            data.state,
            data.postalCode,
            data.openedOn,
            status,
            branchId,
            businessId,
          ]
        );

        await connection.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id,
             actor_user_id,
             action,
             subject_type,
             subject_id,
             details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            user.id,
            "BRANCH_UPDATED",
            "BRANCH",
            branchId,
            JSON.stringify({
              division_id: before.division_id,
              branch_code: before.branch_code,
              previous_status: before.status,
              new_status: status,
              branch_name: data.branchName,
              profile_updated: true,
            }),
          ]
        );

        await connection.commit();
        outcome = "updated";
      }
    }

    if (outcome !== "updated") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback();
    console.error("Branch update failed:", error);
  } finally {
    connection.release();
  }

  if (outcome === "updated") {
    revalidatePath("/branches");
  }

  redirect(`/branches?result=${outcome}`);
}
