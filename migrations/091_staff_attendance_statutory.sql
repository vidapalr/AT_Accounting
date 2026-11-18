-- 091: Staff types and CTC, attendance register (WhatsApp IN/OUT), statutory registrations and portal logins.
-- Screens: Staff records (type of work, daily wage, WhatsApp number), Staff > Attendance register,
-- Payroll (days paid from attendance), Set-up > Registrations and portal logins.
-- Before it is run: everyone is treated as full time and the new screens ask for this file.
-- Idempotent: safe to run more than once. No existing figures change.

-- 1) Kind of work, daily wage and the WhatsApp number used for attendance
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS employment_type ENUM('FULL_TIME','PART_TIME','DAILY_WAGE') NOT NULL DEFAULT 'FULL_TIME';
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS daily_wage DECIMAL(12,2) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(15) NULL;

-- 2) Attendance: one row per person per day
CREATE TABLE IF NOT EXISTS acct_attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  in_time TIME NULL,
  out_time TIME NULL,
  status ENUM('PRESENT','HALF_DAY','ABSENT','LEAVE','WEEKLY_OFF','HOLIDAY') NULL,
  source ENUM('WHATSAPP','MANUAL') NOT NULL DEFAULT 'MANUAL',
  note VARCHAR(200) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_day (legal_business_id, employee_id, work_date),
  KEY idx_attendance_month (legal_business_id, work_date),
  CONSTRAINT fk_attendance_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Registrations (PF, ESI, GST, income tax, ...) with portal logins; passwords are stored encrypted
CREATE TABLE IF NOT EXISTS acct_statutory_logins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('PF','ESI','GST','INCOME_TAX','TDS','PROFESSIONAL_TAX','SHOP_LICENCE','UDYAM','TRADE_LICENCE','BANK','OTHER') NOT NULL,
  label VARCHAR(100) NOT NULL,
  registration_no VARCHAR(60) NULL,                    -- PF code, ESI code, GSTIN, PAN, TAN ... (outside identifiers)
  portal_url VARCHAR(255) NULL,
  login_id VARCHAR(120) NULL,
  password_cipher VARBINARY(512) NULL,                 -- encrypted with the app's key; never shown in lists
  registered_on DATE NULL,
  renewal_due DATE NULL,
  note VARCHAR(300) NULL,
  status ENUM('ACTIVE','REMOVED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_statutory_business (legal_business_id, status),
  CONSTRAINT fk_statutory_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Every time someone shows a password: who, which login, when
CREATE TABLE IF NOT EXISTS acct_statutory_login_views (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  login_id BIGINT UNSIGNED NOT NULL,
  viewed_by BIGINT UNSIGNED NOT NULL,
  viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_views (legal_business_id, login_id, viewed_at),
  CONSTRAINT fk_login_views_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
