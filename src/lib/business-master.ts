
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export interface BusinessRecord extends RowDataPacket {
  id: number;
  legal_name: string;
  trading_name: string | null;
  legal_form: string;
  currency_code: string;
  pan_last4: string | null;
  gstin: string | null;
  udyam_registration_no: string | null;
  registration_year: number | null;
}

export interface DivisionRecord extends RowDataPacket {
  id: number;
  legal_business_id: number;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
}

export interface FinancialYearRecord extends RowDataPacket {
  id: number;
  label: string;
  starts_on: string;
  ends_on: string;
  status: "OPEN" | "LOCKED" | "CLOSED";
}

export async function getBusiness(
  businessId: number
): Promise<BusinessRecord | null> {
  const [rows] = await db.execute<BusinessRecord[]>(
    `SELECT
       id,
       legal_name,
       trading_name,
       legal_form,
       currency_code,
       pan_last4,
       udyam_registration_no,
       registration_year,
       gstin
     FROM acct_legal_businesses
     WHERE id = ?
     LIMIT 1`,
    [businessId]
  );

  return rows[0] ?? null;
}

export async function getDivisions(
  businessId: number
): Promise<DivisionRecord[]> {
  const [rows] = await db.execute<DivisionRecord[]>(
    `SELECT
       id,
       legal_business_id,
       code,
       name,
       status,
       DATE_FORMAT(
         created_at, '%Y-%m-%d'
       ) AS created_at
     FROM acct_divisions
     WHERE legal_business_id = ?
     ORDER BY name`,
    [businessId]
  );

  return rows;
}

export async function getFinancialYears(
  businessId: number
): Promise<FinancialYearRecord[]> {
  const [rows] = await db.execute<FinancialYearRecord[]>(
    `SELECT
       id,
       label,
       DATE_FORMAT(
         starts_on, '%Y-%m-%d'
       ) AS starts_on,
       DATE_FORMAT(
         ends_on, '%Y-%m-%d'
       ) AS ends_on,
       status
     FROM acct_financial_years
     WHERE legal_business_id = ?
     ORDER BY starts_on DESC`,
    [businessId]
  );

  return rows;
}
