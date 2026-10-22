
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

export type BusinessPerson = RowDataPacket & {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role:
    | "LEGAL_PROPRIETOR"
    | "AUTHORIZED_REPRESENTATIVE"
    | "DIVISION_MANAGER";
  division_id: number | null;
  division_name: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export async function getBusinessPeople(
  businessId: number
): Promise<BusinessPerson[]> {
  const user = await requireGroupOwner();

  if (user.legal_business_id !== businessId) {
    throw new Error("Access denied.");
  }

  const [rows] = await db.execute<BusinessPerson[]>(
    `SELECT
       p.id, p.full_name, p.email, p.phone,
       p.role, p.status,p.division_id,
       d.name AS division_name
     FROM acct_business_people p
     LEFT JOIN acct_divisions d
       ON d.id = p.division_id
      AND d.legal_business_id = p.legal_business_id
     WHERE p.legal_business_id = ?
     ORDER BY p.id DESC`,
    [businessId]
  );

  return rows;
}

export async function createBusinessPersonAction(
  form: FormData
) {
  const user = await requireGroupOwner();

  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  const name = text("full_name");
  const email = text("email").toLowerCase();
  const phone = text("phone");
  const role = text("role");
  const divisionText = text("division_id");
  const divisionId = divisionText ? Number(divisionText) : null;

  const roles = [
    "LEGAL_PROPRIETOR",
    "AUTHORIZED_REPRESENTATIVE",
    "DIVISION_MANAGER",
  ];

  if (
    name.length < 3 ||
    name.length > 180 ||
    email.length > 190 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (phone && !/^\+?[0-9]{10,15}$/.test(phone)) ||
    !roles.includes(role) ||
    (divisionId !== null &&
      (!Number.isSafeInteger(divisionId) || divisionId <= 0))
  ) {
    redirect("/group?error=Invalid%20person%20details");
  }

  // A proprietorship has one legal proprietor.
  // This UI cannot add another legal proprietor.
  if (role === "LEGAL_PROPRIETOR") {
    redirect(
      "/group?error=Legal%20proprietor%20must%20be%20managed%20separately"
    );
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    if (divisionId !== null) {
      const [divisions] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_divisions
         WHERE id = ?
           AND legal_business_id = ?
           AND status = 'ACTIVE'`,
        [divisionId, user.legal_business_id]
      );

      if (divisions.length !== 1) {
        throw new Error("Division is not active or authorized.");
      }
    }

    const [result] = await connection.execute<
      import("mysql2").ResultSetHeader
    >(
      `INSERT INTO acct_business_people
       (legal_business_id, division_id,
        full_name, email, phone, role, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        user.legal_business_id,
        divisionId,
        name,
        email || null,
        phone || null,
        role,
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
        "BUSINESS_PERSON_CREATED",
        "BUSINESS_PERSON",
        result.insertId,
        JSON.stringify({
          role,
          division_id: divisionId,
        }),
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Person registration failed:", error);
    redirect("/group?error=Unable%20to%20add%20person");
  } finally {
    connection.release();
  }

  revalidatePath("/group");
  redirect("/group?updated=1");
}
