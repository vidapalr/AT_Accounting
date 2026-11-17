-- 085: Each company can post to its own chart of accounts (Accounting > Account mapping).
-- A row says: postings of this kind (role) go to this account code. No rows = the standard codes,
-- exactly as today. Nothing already posted changes; only new postings use a changed mapping.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_account_map (
  legal_business_id BIGINT UNSIGNED NOT NULL,
  role_key VARCHAR(60) NOT NULL,
  account_code VARCHAR(20) NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (legal_business_id, role_key),
  CONSTRAINT fk_account_map_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
