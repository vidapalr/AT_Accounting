-- 084: Staff letter wording that each company can change (Set-up > Letter templates).
-- Until a row exists for a letter, the standard wording in src/lib/staff-letters.ts is used.
-- Idempotent: safe to run more than once. No figures change.

CREATE TABLE IF NOT EXISTS acct_letter_templates (
  legal_business_id BIGINT UNSIGNED NOT NULL,
  letter_type VARCHAR(40) NOT NULL,
  heading VARCHAR(120) NOT NULL,
  body TEXT NOT NULL,
  needs_acceptance TINYINT(1) NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (legal_business_id, letter_type),
  CONSTRAINT fk_letter_templates_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
