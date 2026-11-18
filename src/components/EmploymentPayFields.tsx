"use client";

import { useState } from "react";

import { EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/payroll/ctc";
import { field, muted } from "@/lib/ui/styles";

const WORDS: Record<EmploymentType, string> = {
  FULL_TIME: "Paid the same amount every month. Days marked absent in the attendance register are cut.",
  PART_TIME: "Paid a fixed amount every month. Days marked absent in the attendance register are cut.",
  DAILY_WAGE: "Pay each month = daily wage × days present in the attendance register (a half day counts half).",
  HOURLY: "Pay each month = rate × hours worked, taken from the IN and OUT times in the attendance register.",
};

type Props = {
  type?: string;
  monthlySalary?: string;
  dailyWage?: string;
  hourlyRate?: string;
  /** Show the monthly salary box (the Add a person form). The staff record changes the salary elsewhere. */
  showSalary?: boolean;
};

/** Type of work and the one pay box that goes with it, so nobody fills in a wage that is not used. */
export default function EmploymentPayFields({ type = "FULL_TIME", monthlySalary = "", dailyWage = "", hourlyRate = "", showSalary = false }: Props) {
  const [chosen, setChosen] = useState<EmploymentType>((EMPLOYMENT_TYPES.some((t) => t.key === type) ? type : "FULL_TIME") as EmploymentType);
  const monthly = chosen === "FULL_TIME" || chosen === "PART_TIME";
  return (
    <>
      <label>Type of work
        <select name="employment_type" value={chosen} onChange={(e) => setChosen(e.target.value as EmploymentType)} style={field}>
          {EMPLOYMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </label>
      {monthly && showSalary ? (
        <label>Monthly salary (₹)<input name="monthly_salary" inputMode="decimal" defaultValue={monthlySalary} required style={field} /></label>
      ) : null}
      {chosen === "DAILY_WAGE" ? (
        <label>Wage for one day (₹)<input name="daily_wage" inputMode="decimal" defaultValue={dailyWage} required style={field} /></label>
      ) : null}
      {chosen === "HOURLY" ? (
        <label>Rate for one hour (₹)<input name="hourly_rate" inputMode="decimal" defaultValue={hourlyRate} required style={field} /></label>
      ) : null}
      <p style={{ ...muted, gridColumn: "1 / -1", margin: 0 }}>{WORDS[chosen]}</p>
    </>
  );
}
