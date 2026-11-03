-- Dated notes on a customer (called, promised to pay, likes silk...), shown in the customer's history. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_customer_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  note VARCHAR(500) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cust_notes (legal_business_id, customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
