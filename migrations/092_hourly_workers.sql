-- 092: Hourly workers.
-- Screens: Staff records (type of work now includes "Paid by the hour", hourly rate), Staff > Attendance register
-- (hours worked in the month), Payroll (an hourly person's pay = rate x hours from the register).
-- Before it is run: "Paid by the hour" cannot be chosen and the hourly rate box asks for this file.
-- Idempotent: safe to run more than once. No existing figures change.

-- 1) Allow HOURLY beside the three kinds added in 091
ALTER TABLE acct_employees
  MODIFY COLUMN employment_type ENUM('FULL_TIME','PART_TIME','DAILY_WAGE','HOURLY') NOT NULL DEFAULT 'FULL_TIME';

-- 2) The rate for one hour of work
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(12,2) NULL;
