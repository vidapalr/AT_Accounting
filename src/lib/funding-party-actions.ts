
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/codes";
import { requireGroupOwner } from "@/lib/auth";

type PartyType =
  | "INDIVIDUAL"
  | "BUSINESS"
  | "FINANCIAL_INSTITUTION";

type PartyStatus = "ACTIVE" | "INACTIVE";

interface ExistingParty extends RowDataPacket {
  id: number;
  party_code: string;
  party_type: PartyType;
  full_name: string;
  phone: string | null;
  email: string | null;
  pan_last4: string | null;
  status: PartyStatus;
  notes: string | null;
}

function read(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validate(form: FormData) {
  const partyCode = read(form, "party_code").toUpperCase();
  const partyType = read(form, "party_type");
  const fullName = read(form, "full_name");
  const phone = read(form, "phone").replace(/[\s()-]/g, "");
  const email = read(form, "email").toLowerCase();
  const panLast4 = read(form, "pan_last4").toUpperCase();
  const notes = read(form, "notes");

  const allowedTypes = [
    "INDIVIDUAL",
    "BUSINESS",
    "FINANCIAL_INSTITUTION",
  ];

  if (partyCode && !/^[A-Z][A-Z0-9_-]{1,31}$/.test(partyCode)) {
    throw new Error("Invalid party code");
  }

  if (!allowedTypes.includes(partyType)) {
    throw new Error("Invalid party type");
  }

  if (fullName.length < 3 || fullName.length > 180) {
    throw new Error("Invalid party name");
  }

  if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) {
    throw new Error("Invalid phone number");
  }

  if (
    email.length > 190 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    throw new Error("Invalid email");
  }

  if (panLast4 && !/^[0-9]{3}[A-Z]$/.test(panLast4)) {
    throw new Error("Invalid PAN reference");
    }

  if (notes.length > 2000) {
    throw new Error("Notes are too long");
  }

  return {
    partyCode,
    partyType: partyType as PartyType,
    fullName,
    phone: phone || null,
    email: email || null,
    panLast4: panLast4 || null,
    notes: notes || null,
  };
}

export async function createFundingPartyAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  let outcome = "failed";

  try {
    const data = validate(form);
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [business] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

      if (!business.length) {
        throw new Error("Business not found");
      }

      if (!data.partyCode) {
        data.partyCode = await nextCode(connection, {
          table: "acct_funding_parties",
          column: "party_code",
          prefix: "PTY-",
          width: 3,
          where: "legal_business_id = ?",
          params: [businessId],
        });
      }

      const [duplicates] = await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_funding_parties
         WHERE legal_business_id = ?
           AND party_code = ?
         LIMIT 1`,
        [businessId, data.partyCode]
      );

      if (duplicates.length) {
        outcome = "duplicate";
        await connection.rollback();
      } else {
        const [result] =
          await connection.execute<ResultSetHeader>(
            `INSERT INTO acct_funding_parties
             (legal_business_id, party_code, party_type,
              full_name, phone, email, pan_last4,
              status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
            [
              businessId,
              data.partyCode,
              data.partyType,
              data.fullName,
              data.phone,
              data.email,
              data.panLast4,
              data.notes,
            ]
          );

        await connection.execute(
          `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id,
            action, subject_type, subject_id, details_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            user.id,
            "FUNDING_PARTY_CREATED",
            "FUNDING_PARTY",
            result.insertId,
            JSON.stringify({
              party_code: data.partyCode,
              party_type: data.partyType,
            }),
          ]
        );

        await connection.commit();
        outcome = "created";
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof Error) {
      const allowedErrors: Record<string, string> = {
        "Invalid party code": "party-code",
        "Invalid party type": "party-type",
        "Invalid party name": "party-name",
        "Invalid phone number": "phone",
        "Invalid email": "email",
        "Invalid PAN reference": "pan",
        "Notes are too long": "notes",
      };

      if (allowedErrors[error.message]) {
        outcome = allowedErrors[error.message];
      } else {
        console.error("Funding party creation failed:", error);
        outcome = "failed";
      }
    } else {
      outcome = "failed";
    }
  }

  if (outcome === "created") {
    revalidatePath("/funding");
  }

  redirect(`/funding?result=${outcome}`);
}

export async function updateFundingPartyAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const idText = read(form, "party_id");
  const partyId = Number(idText);
  const status = read(form, "status");

  if (
    !/^[1-9]\d*$/.test(idText) ||
    !Number.isSafeInteger(partyId) ||
    !["ACTIVE", "INACTIVE"].includes(status)
  ) {
    redirect("/funding?result=invalid");
  }

  let outcome = "failed";

  try {
    const data = validate(form);
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.execute<ExistingParty[]>(
        `SELECT id, party_code, party_type, full_name,
                phone, email, pan_last4, status, notes
         FROM acct_funding_parties
         WHERE id = ? AND legal_business_id = ?
         FOR UPDATE`,
        [partyId, businessId]
      );

      const before = rows[0];

      if (!before) {
        outcome = "not-found";
        await connection.rollback();
      } else if (data.partyCode !== before.party_code) {
        // Party codes are immutable after creation.
        outcome = "invalid";
        await connection.rollback();
      } else {
        if (status === "INACTIVE") {
          const [agreements] =
            await connection.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_funding_agreements
               WHERE legal_business_id = ?
                 AND party_id = ?
                 AND status = 'ACTIVE'
               LIMIT 1`,
              [businessId, partyId]
            );

          if (agreements.length) {
            outcome = "active-agreement";
            await connection.rollback();
          }
        }

        if (outcome !== "active-agreement") {
          await connection.execute(
            `UPDATE acct_funding_parties
             SET party_type = ?, full_name = ?,
                 phone = ?, email = ?, pan_last4 = ?,
                 status = ?, notes = ?
             WHERE id = ? AND legal_business_id = ?`,
            [
              data.partyType,
              data.fullName,
              data.phone,
              data.email,
              data.panLast4,
              status,
              data.notes,
              partyId,
              businessId,
            ]
          );

          await connection.execute(
            `INSERT INTO acct_audit_events
             (legal_business_id, actor_user_id,
              action, subject_type, subject_id, details_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              businessId,
              user.id,
              "FUNDING_PARTY_UPDATED",
              "FUNDING_PARTY",
              partyId,
              JSON.stringify({
                before: {
                  party_type: before.party_type,
                  status: before.status,
                },
                after: {
                  party_type: data.partyType,
                  status,
                },
                profileUpdated: true,
              }),
            ]
          );

          await connection.commit();
          outcome = "updated";
        }
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof Error &&
        (error.message.startsWith("Invalid") ||
         error.message === "Notes are too long")) {
      outcome = "invalid";
    } else {
      console.error("Funding party update failed:", error);
    }
  }

  if (outcome === "updated") {
    revalidatePath("/funding");
  }

  redirect(`/funding?result=${outcome}`);
}
