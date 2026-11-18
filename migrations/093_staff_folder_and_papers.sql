-- 093: A folder of papers for every member of staff, and the last four digits of their Aadhaar.
-- Screens: Staff records > one person (Papers: personal and official, upload and view), letters saved
-- into the person's folder, Payroll (payslips saved there too).
-- Files themselves are kept outside the app folder, one folder per person:
--   PRIVATE_DIR/staff/<company id>/<person id>/<name>.pdf|jpg|png
-- Before it is run: the Papers section asks for this file. No existing figures change.
-- Idempotent: safe to run more than once.

-- 1) Aadhaar: only the last four digits are kept in the database; the card itself is a file in the
--    person's folder. The full number is not stored anywhere.
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS aadhaar_last4 CHAR(4) NULL;

-- 2) One row for every paper in a person's folder
CREATE TABLE IF NOT EXISTS acct_employee_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  folder ENUM('PERSONAL','OFFICIAL') NOT NULL DEFAULT 'PERSONAL',
  kind ENUM('AADHAAR','PAN','PHOTO','ADDRESS_PROOF','BANK_PROOF','QUALIFICATION','OTHER_PERSONAL',
            'OFFER_LETTER','APPOINTMENT_LETTER','ENGAGEMENT_LETTER','CONFIRMATION_LETTER','INCREMENT_LETTER',
            'WARNING_LETTER','RESIGNATION','RELIEVING_LETTER','EXPERIENCE_LETTER','PAYSLIP','AGREEMENT','OTHER_OFFICIAL')
       NOT NULL DEFAULT 'OTHER_PERSONAL',
  label VARCHAR(150) NULL,
  storage_key VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
  /** For a payslip or a letter: the month or date it belongs to, so the folder reads in order. */
  belongs_to VARCHAR(10) NULL,
  status ENUM('ACTIVE','REMOVED') NOT NULL DEFAULT 'ACTIVE',
  uploaded_by BIGINT UNSIGNED NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_document_key (storage_key),
  KEY idx_employee_documents (legal_business_id, employee_id, folder, kind),
  CONSTRAINT fk_employee_documents_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
