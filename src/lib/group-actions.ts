
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import type { RowDataPacket } from "mysql2";

type BusinessRow = RowDataPacket & {
  legal_name: string;
  trading_name: string | null;
  gstin: string | null;
  pan_last4: string | null;
  udyam_registration_no: string | null;
  registration_year: number | null;
};

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateGroupAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const legalName = field(form, "legal_name");
  const tradingName = field(form, "trading_name");
  const gstin = field(form, "gstin").toUpperCase();
  const panLast4 = field(form, "pan_last4").toUpperCase();
  const udyam = field(form, "udyam_registration_no")
    .toUpperCase();
  const yearText = field(form, "registration_year");

  const currentYear = new Date().getFullYear();
  const year = yearText ? Number(yearText) : null;

  let error = "";

  if (!legalName || legalName.length > 180) {
    error = "Invalid legal name.";
  } else if (tradingName.length > 180) {
    error = "Trading name is too long.";
  } else if (
    gstin &&
    !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)
  ) {
    error = "Invalid GSTIN format.";
  } else if (
    panLast4 &&
    !/^(?:[A-Z][0-9]{3}|[0-9]{3}[A-Z])$/.test(panLast4)
  ) {
    error = "Invalid PAN last four characters.";
  } else if (
    udyam &&
    !/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(udyam)
  ) {
    error = "Invalid Udyam registration number.";
  } else if (
    yearText &&
    (!/^\d{4}$/.test(yearText) ||
      !Number.isInteger(year) ||
      year! < 1900 ||
      year! > currentYear)
  ) {
    error = "Invalid registration year.";
  }

  if (error) {
    redirect(`/group?error=${encodeURIComponent(error)}`);
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<BusinessRow[]>(
      `SELECT legal_name, trading_name, gstin, pan_last4,
              udyam_registration_no, registration_year
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (rows.length !== 1) {
      throw new Error("Business record not found.");
    }

    const before = rows[0];

    await connection.execute(
      `UPDATE acct_legal_businesses
       SET legal_name = ?,
           trading_name = ?,
           gstin = ?,
           pan_last4 = ?,
           udyam_registration_no = ?,
           registration_year = ?
       WHERE id = ?`,
      [
        legalName,
        tradingName || null,
        gstin || null,
        panLast4 || null,
        udyam || null,
        year,
        businessId,
      ]
    );

    // Do not include sensitive identity numbers in audit JSON.
    await connection.execute(
      `INSERT INTO acct_audit_events
       (legal_business_id, actor_user_id, action,
        subject_type, subject_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        user.id,
        "BUSINESS_UPDATED",
        "LEGAL_BUSINESS",
        businessId,
        JSON.stringify({
          before: {
            legal_name: before.legal_name,
            trading_name: before.trading_name,
            registration_year: before.registration_year,
          },
          after: {
            legal_name: legalName,
            trading_name: tradingName,
            registration_year: year,
          },
          registrationFieldsUpdated: true,
        }),
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Group update failed:", error);
    redirect(
      "/group?error=" +
      encodeURIComponent("Unable to update business details.")
    );
  } finally {
    connection.release();
  }

  revalidatePath("/group");
  redirect("/group?updated=1");
}
