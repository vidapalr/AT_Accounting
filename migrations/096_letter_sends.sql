-- 096: Letters sent to staff on WhatsApp or email, and their acceptance by WhatsApp reply.
-- Staff record > Papers uses it (Send on WhatsApp, Accepted badge). Before it is run the Send buttons
-- say this file is needed and nothing is sent.
-- Idempotent: safe to run more than once. No figures or posted entries change.

CREATE TABLE IF NOT EXISTS acct_letter_sends (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  document_id BIGINT UNSIGNED NOT NULL,            -- the paper in the person's folder that was sent
  channel ENUM('WHATSAPP','EMAIL') NOT NULL,
  sent_to VARCHAR(150) NOT NULL,                   -- +91 number or email address
  needs_acceptance TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('SENT','FAILED','ACCEPTED') NOT NULL,
  wa_message_id VARCHAR(100) NULL,
  error_text VARCHAR(300) NULL,
  file_sha256 CHAR(64) NULL,                        -- fingerprint of the exact file sent
  accepted_at TIMESTAMP NULL,
  accepted_from VARCHAR(20) NULL,
  accepted_words VARCHAR(100) NULL,
  accepted_message_id VARCHAR(100) NULL,
  accepted_document_id BIGINT UNSIGNED NULL,        -- the accepted copy kept in the folder
  sent_by BIGINT UNSIGNED NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_letter_sends_employee (legal_business_id, employee_id),
  KEY idx_letter_sends_document (legal_business_id, document_id),
  KEY idx_letter_sends_open (legal_business_id, status, sent_to),
  CONSTRAINT fk_letter_sends_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
