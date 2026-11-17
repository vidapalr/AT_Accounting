-- 088: Payroll with statutory deductions (Staff > Payroll).
-- Adds: PF/ESI/PAN details on each person; the parts a salary is split into (Basic, HRA, ...);
-- one payslip per person per month with every amount; the record of PF, ESI, PT and TDS paid to
-- the government; the expense kind for the employer's PF and ESI share (account 6015).
-- PF, ESI, professional tax and TDS stay OFF until the owner switches them on (Payroll settings).
-- Idempotent: safe to run more than once. No existing figures change.

-- 1) Statutory details on each person
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS pan CHAR(10) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS uan CHAR(12) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS name_as_per_uan VARCHAR(150) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS esi_number VARCHAR(17) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS pf_member TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS esi_member TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS pt_applicable TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS tax_regime ENUM('NEW','OLD') NOT NULL DEFAULT 'NEW';
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS old_regime_deductions DECIMAL(18,2) NOT NULL DEFAULT 0;

-- 2) Parts of a salary, per company (share of the monthly salary; NULL share = the balance)
CREATE TABLE IF NOT EXISTS acct_pay_components (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(60) NOT NULL,
  percent_bps INT UNSIGNED NULL,
  pf_wage TINYINT(1) NOT NULL DEFAULT 0,
  esi_wage TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  UNIQUE KEY uq_pay_component (legal_business_id, code),
  CONSTRAINT fk_pay_components_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO acct_pay_components (legal_business_id, code, name, percent_bps, pf_wage, esi_wage, sort_order)
SELECT b.id, c.code, c.name, c.pct, c.pf, 1, c.sort
  FROM acct_legal_businesses b
  JOIN (
    SELECT 'BASIC' AS code, 'Basic pay' AS name, 5000 AS pct, 1 AS pf, 1 AS sort UNION ALL
    SELECT 'HRA', 'House rent allowance', 2000, 0, 2 UNION ALL
    SELECT 'SPECIAL', 'Special allowance', NULL, 0, 3
  ) c;

-- 3) One payslip per person per month
CREATE TABLE IF NOT EXISTS acct_payslips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  salary_month CHAR(7) NOT NULL,
  status ENUM('DRAFT','PAID') NOT NULL DEFAULT 'DRAFT',
  monthly_salary DECIMAL(18,2) NOT NULL,
  days_in_month TINYINT UNSIGNED NOT NULL,
  paid_days DECIMAL(4,1) NOT NULL,
  gross DECIMAL(18,2) NOT NULL,
  pf_wages DECIMAL(18,2) NOT NULL DEFAULT 0,
  eps_wages DECIMAL(18,2) NOT NULL DEFAULT 0,
  edli_wages DECIMAL(18,2) NOT NULL DEFAULT 0,
  esi_wages DECIMAL(18,2) NOT NULL DEFAULT 0,
  emp_pf DECIMAL(18,2) NOT NULL DEFAULT 0,
  emp_esi DECIMAL(18,2) NOT NULL DEFAULT 0,
  emp_pt DECIMAL(18,2) NOT NULL DEFAULT 0,
  emp_tds DECIMAL(18,2) NOT NULL DEFAULT 0,
  advance_deducted DECIMAL(18,2) NOT NULL DEFAULT 0,
  er_epf DECIMAL(18,2) NOT NULL DEFAULT 0,
  er_eps DECIMAL(18,2) NOT NULL DEFAULT 0,
  er_edli DECIMAL(18,2) NOT NULL DEFAULT 0,
  er_pf_admin DECIMAL(18,2) NOT NULL DEFAULT 0,
  er_esi DECIMAL(18,2) NOT NULL DEFAULT 0,
  net_pay DECIMAL(18,2) NOT NULL,
  detail_json TEXT NOT NULL,
  salary_expense_id BIGINT UNSIGNED NULL,
  employer_expense_id BIGINT UNSIGNED NULL,
  pf_remittance_id BIGINT UNSIGNED NULL,
  esi_remittance_id BIGINT UNSIGNED NULL,
  pt_remittance_id BIGINT UNSIGNED NULL,
  tds_remittance_id BIGINT UNSIGNED NULL,
  paid_on DATE NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payslip_month (legal_business_id, employee_id, salary_month),
  KEY idx_payslip_month (legal_business_id, salary_month, status),
  CONSTRAINT fk_payslips_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) PF, ESI, professional tax and TDS paid to the government
CREATE TABLE IF NOT EXISTS acct_statutory_remittances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  statute ENUM('PF','ESI','PT','TDS') NOT NULL,
  salary_month CHAR(7) NOT NULL,
  paid_on DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  challan_no VARCHAR(60) NULL,
  bank_account_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_remittance_month (legal_business_id, statute, salary_month),
  CONSTRAINT fk_remittances_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) The employer's PF and ESI share is its own kind of expense
ALTER TABLE acct_expenses
  MODIFY category ENUM('RENT','ELECTRICITY','TRANSPORT','PACKING','SALARY','EMPLOYER_CONTRIBUTION','MAINTENANCE','MARKETING','INTERNET_PHONE','OFFICE_SUPPLIES','BANK_CHARGES','MISCELLANEOUS') NOT NULL;

-- Account 6015, set up like each company's salary account 6010.
INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name, account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account, requires_division, requires_branch, status, description
)
SELECT s.legal_business_id, '6015', 'Employer PF, ESI and EDLI', s.account_type, s.account_subtype, s.normal_balance,
       1, 1, s.requires_division, s.requires_branch, 'ACTIVE',
       'The business''s own share of provident fund, pension, EDLI, PF admin charges and ESI.'
  FROM acct_chart_of_accounts s
 WHERE s.account_code = '6010'
   AND NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = s.legal_business_id AND c.account_code = '6015');

-- 6) Professional tax preset for the first company (Telangana); switch it on in Payroll settings
INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT MIN(id), 'payroll_pt_state', 'TELANGANA' FROM acct_legal_businesses HAVING MIN(id) IS NOT NULL;
