-- 031: Staff advances
--
-- Money given to a staff member before payday is an asset (account 1330 Staff Advances),
-- not an expense. When the next salary is paid, part or all of the advance is taken off it:
-- the salary expense is still the full salary, part of it is settled by clearing the advance
-- (an expense "payment" with method ADVANCE), and only the rest is paid in cash or bank.
--
--   acct_staff_advances            advances given
--   acct_staff_advance_recoveries  how much of each advance each salary cleared
--   acct_salary_payments.advance_deducted  the part of that month's salary that cleared advances
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_staff_advances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  advance_no VARCHAR(40) NOT NULL,
  given_on DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  paid_from ENUM('CASH','BANK') NOT NULL,
  bank_account_id BIGINT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  payment_method ENUM('CASH','UPI','BANK_TRANSFER','CHEQUE') NOT NULL,
  instalment DECIMAL(18,2) NULL,
  note VARCHAR(300) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_advance_no (legal_business_id, advance_no),
  KEY idx_staff_advance_employee (legal_business_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_staff_advance_recoveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  advance_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  expense_payment_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  recovered_on DATE NOT NULL,
  PRIMARY KEY (id),
  KEY idx_staff_recovery_advance (advance_id),
  KEY idx_staff_recovery_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE acct_salary_payments ADD COLUMN IF NOT EXISTS advance_deducted DECIMAL(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE acct_expense_payments
  MODIFY payment_method ENUM('CASH','UPI','BANK_TRANSFER','CARD','CHEQUE','OTHER','ADVANCE') NOT NULL;

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '1330', 'Staff Advances', 'ASSET', 'CURRENT', 'DEBIT',
       1, 1, 0, 0, 'ACTIVE',
       'Money given to staff before payday, to be taken off their salary.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '1330');
