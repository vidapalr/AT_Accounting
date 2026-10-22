
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

interface PersonRow extends RowDataPacket {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  division_id: number | null;
  status: string;
}

function value(form: FormData, key: string) {
  const input = form.get(key);
  return typeof input === "string" ? input.trim() : "";
}

export async function updateBusinessPersonAction(
  form: FormData
) {
  const user = await requireGroupOwner();

  const idText = value(form, "person_id");
  const personId = Number(idText);

  const fullName = value(form, "full_name");
  const email = value(form, "email").toLowerCase();
  const phone = value(form, "phone");
  const role = value(form, "role");
  const status = value(form, "status");

  const divisionText = value(form, "division_id");
  const divisionId = divisionText
    ? Number(divisionText)
    : null;

  const allowedRoles = [
    "AUTHORIZED_REPRESENTATIVE",
    "DIVISION_MANAGER",
  ];

  const valid =
    /^[1-9]\d*$/.test(idText) &&
    Number.isSafeInteger(personId) &&
    fullName.length >= 3 &&
    fullName.length <= 180 &&
    email.length <= 190 &&
    (!email ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) &&
    (!phone || /^\+?[0-9]{10,15}$/.test(phone)) &&
    allowedRoles.includes(role) &&
    ["ACTIVE", "INACTIVE"].includes(status) &&
    (divisionId === null ||
      (Number.isSafeInteger(divisionId) &&
        divisionId > 0));

  if (!valid) {
    redirect("/group?person=invalid");
  }

  const connection = await db.getConnection();

  let outcome: "updated" | "not-found" | "failed" =
    "failed";

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<PersonRow[]>(
      `SELECT
         id, full_name, email, phone,
         role, division_id, status
       FROM acct_business_people
       WHERE id = ?
         AND legal_business_id = ?
       FOR UPDATE`,
      [personId, user.legal_business_id]
    );

    const before = rows[0];

    if (!before) {
      await connection.rollback();
      outcome = "not-found";
    } else if (before.role === "LEGAL_PROPRIETOR") {
      // Legal proprietor records cannot be changed
      // through the operational personnel form.
      await connection.rollback();
      outcome = "failed";
    } else {
      if (divisionId !== null) {
        const [divisions] =
          await connection.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_divisions
             WHERE id = ?
               AND legal_business_id = ?
               AND status = 'ACTIVE'`,
            [divisionId, user.legal_business_id]
          );

        if (divisions.length !== 1) {
          throw new Error("Invalid division assignment.");
        }
      }

      await connection.execute(
        `UPDATE acct_business_people
         SET full_name = ?,
             email = ?,
             phone = ?,
             role = ?,
             division_id = ?,
             status = ?
         WHERE id = ?
           AND legal_business_id = ?`,
        [
          fullName,
          email || null,
          phone || null,
          role,
          divisionId,
          status,
          personId,
          user.legal_business_id,
        ]
      );

      await connection.execute(
        `INSERT INTO acct_audit_events
         (legal_business_id, actor_user_id,
          action, subject_type, subject_id, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          user.legal_business_id,
          user.id,
          "BUSINESS_PERSON_UPDATED",
          "BUSINESS_PERSON",
          personId,
          JSON.stringify({
            before: {
              role: before.role,
              division_id: before.division_id,
              status: before.status,
            },
            after: {
              role,
              division_id: divisionId,
              status,
            },
            profileUpdated: true,
          }),
        ]
      );

      await connection.commit();
      outcome = "updated";
    }
  } catch (error) {
    await connection.rollback();
    console.error("Person update failed:", error);
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "updated") {
    revalidatePath("/group");
  }

  redirect(`/group?person=${outcome}`);
}
