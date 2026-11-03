-- 058: document register. Every print of a bill, estimate, voucher or expense record is logged (who, when);
-- a reprint needs a reason. A saved copy of the paper as printed is kept, so the original can be opened again later.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_document_copies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  doc_type ENUM('INVOICE','ESTIMATE','VOUCHER','EXPENSE_RECORD') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  doc_ref VARCHAR(80) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_doc_copy_source (legal_business_id, doc_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_document_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  doc_type ENUM('INVOICE','ESTIMATE','VOUCHER','EXPENSE_RECORD') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  doc_ref VARCHAR(80) NOT NULL,
  event ENUM('PRINT','REPRINT') NOT NULL,
  reason VARCHAR(300) NULL,
  copy_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_doc_log_source (legal_business_id, doc_type, source_id),
  KEY idx_doc_log_time (legal_business_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
