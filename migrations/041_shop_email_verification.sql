-- 041: website customers confirm their email. Safe to run twice.
-- Customers who signed up before this date are treated as already confirmed.
ALTER TABLE acct_shop_customers
  ADD COLUMN IF NOT EXISTS email_verified_at DATETIME DEFAULT NULL;

UPDATE acct_shop_customers
   SET email_verified_at = created_at
 WHERE email_verified_at IS NULL AND created_at < '2026-10-29 00:00:00';

CREATE TABLE IF NOT EXISTS acct_shop_email_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_verify_token (token_hash),
  KEY idx_shop_verify_customer (customer_id),
  CONSTRAINT fk_shop_verify_customer FOREIGN KEY (customer_id) REFERENCES acct_shop_customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
