-- 051: a list of records that could not be posted to the ledger, with the reason, so nothing fails silently.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_posting_failures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(400) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  first_failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_posting_failure (legal_business_id, source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
