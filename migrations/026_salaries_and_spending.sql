-- 026: Staff salaries (monthly pay run) and shop spending
--
--   acct_employees          people you pay a salary to
--   acct_salary_payments    one row per person per month, linked to the expense it created
--   acct_expenses.entered_by_role  not needed: who entered is already stored in created_by
--
-- Salary and shop spending are saved as ordinary expenses (category SALARY or the one chosen),
-- so they reach the books, reports and cash closing like every other expense. Run once.

CREATE TABLE IF NOT EXISTS acct_employees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NULL,
  branch_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NULL,
  job_title VARCHAR(100) NULL,
  monthly_salary DECIMAL(18,2) NOT NULL,
  joined_on DATE NULL,
  status ENUM('ACTIVE','LEFT') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_employee_business (legal_business_id, status)
);

CREATE TABLE IF NOT EXISTS acct_salary_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  salary_month CHAR(7) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  note VARCHAR(300) NULL,
  expense_id BIGINT UNSIGNED NOT NULL,
  paid_on DATE NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_salary_employee_month (legal_business_id, employee_id, salary_month)
);
