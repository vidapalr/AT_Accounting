-- 089: Income tax and year-end pack (Accounting > Income tax and year end).
-- Adds: advance and self-assessment tax challans; lines read from the annual tax statement
-- (Form 168, was 26AS); uploaded tax papers (AIS, TIS, certificates, loan statements);
-- bank and vehicle loans with the lender's yearly interest figures; PAN on customers and suppliers.
-- Before it is run the Income tax pages show a "run migration 089" message; nothing else changes.
-- Idempotent: safe to run more than once. No existing figures or posted entries change.

-- 1) Tax paid by challan (advance tax, self-assessment tax)
CREATE TABLE IF NOT EXISTS acct_tax_challans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  tax_year SMALLINT UNSIGNED NOT NULL,                 -- 2026 = tax year 2026-27
  kind ENUM('ADVANCE','SELF_ASSESSMENT','OTHER') NOT NULL DEFAULT 'ADVANCE',
  paid_on DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  bsr_code CHAR(7) NULL,                               -- printed on the challan (outside identifier)
  challan_serial VARCHAR(10) NULL,
  note VARCHAR(250) NULL,
  status ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tax_challans_year (legal_business_id, tax_year, status),
  CONSTRAINT fk_tax_challans_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Lines read from the annual tax statement; replaced each time a new statement is read
CREATE TABLE IF NOT EXISTS acct_tax_statement_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  tax_year SMALLINT UNSIGNED NOT NULL,
  line_kind ENUM('TDS','TAX_PAID') NOT NULL,
  party_name VARCHAR(200) NULL,                        -- deductor (TDS lines)
  tan CHAR(10) NULL,
  amount_paid DECIMAL(18,2) NOT NULL DEFAULT 0,        -- amount paid or credited to us (TDS lines)
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0,         -- TDS deducted, or tax paid
  bsr_code CHAR(7) NULL,
  challan_serial VARCHAR(10) NULL,
  deposit_date DATE NULL,
  minor_head CHAR(3) NULL,                             -- 100 advance tax, 300 self-assessment
  read_by BIGINT UNSIGNED NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tax_statement_year (legal_business_id, tax_year, line_kind),
  CONSTRAINT fk_tax_statement_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Bank, vehicle and other loans taken by the business
CREATE TABLE IF NOT EXISTS acct_loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  loan_code VARCHAR(20) NOT NULL,                      -- automatic, e.g. LN-0001
  lender_name VARCHAR(150) NOT NULL,
  loan_kind ENUM('TERM','VEHICLE','OVERDRAFT','GOLD','OTHER') NOT NULL DEFAULT 'TERM',
  lender_account_no VARCHAR(40) NULL,                  -- lender's loan account number (outside identifier)
  taken_on DATE NOT NULL,
  principal DECIMAL(18,2) NOT NULL,
  rate_bps INT UNSIGNED NOT NULL DEFAULT 0,            -- 1050 = 10.5% a year
  tenure_months INT UNSIGNED NOT NULL DEFAULT 0,
  first_emi_month CHAR(7) NULL,                        -- YYYY-MM
  emi DECIMAL(18,2) NULL,                              -- lender's instalment when it differs from the formula
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  note VARCHAR(250) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loans_code (legal_business_id, loan_code),
  KEY idx_loans_business (legal_business_id, status),
  CONSTRAINT fk_loans_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) The lender's figures for a tax year, from the interest certificate
CREATE TABLE IF NOT EXISTS acct_loan_year_figures (
  loan_id BIGINT UNSIGNED NOT NULL,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  tax_year SMALLINT UNSIGNED NOT NULL,
  certified_interest DECIMAL(18,2) NULL,
  certified_principal DECIMAL(18,2) NULL,
  certified_closing DECIMAL(18,2) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (loan_id, tax_year),
  KEY idx_loan_year_business (legal_business_id, tax_year),
  CONSTRAINT fk_loan_year_loan FOREIGN KEY (loan_id) REFERENCES acct_loans (id),
  CONSTRAINT fk_loan_year_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5) Uploaded tax papers (PDF or photo), kept in private storage
CREATE TABLE IF NOT EXISTS acct_tax_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  tax_year SMALLINT UNSIGNED NOT NULL,
  doc_kind ENUM('STATEMENT','AIS','TIS','TDS_CERTIFICATE','CHALLAN','LOAN_STATEMENT','INTEREST_CERTIFICATE','REGIME_OPT_OUT','RETURN','OTHER') NOT NULL DEFAULT 'OTHER',
  title VARCHAR(150) NOT NULL,
  storage_key VARCHAR(80) NOT NULL,
  mime_type VARCHAR(40) NOT NULL,
  file_size INT UNSIGNED NOT NULL DEFAULT 0,
  loan_id BIGINT UNSIGNED NULL,
  challan_id BIGINT UNSIGNED NULL,
  status ENUM('ACTIVE','REMOVED') NOT NULL DEFAULT 'ACTIVE',
  uploaded_by BIGINT UNSIGNED NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tax_docs_year (legal_business_id, tax_year, status),
  CONSTRAINT fk_tax_docs_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) PAN on customers and suppliers (for the year-end lists; read from the GSTIN when empty)
ALTER TABLE acct_customers ADD COLUMN IF NOT EXISTS pan CHAR(10) NULL;
ALTER TABLE acct_suppliers ADD COLUMN IF NOT EXISTS pan CHAR(10) NULL;
