-- 012: a log of WhatsApp messages sent to customers (tap-to-send), so nobody gets
-- the same announcement twice. Safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_customer_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  message_type ENUM('NEW_STOCK','DUES_REMINDER','OTHER') NOT NULL DEFAULT 'NEW_STOCK',
  -- Which announcement this was, e.g. the new-stock notices it covered.
  batch_key VARCHAR(120) NOT NULL,
  sent_by BIGINT UNSIGNED DEFAULT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_message_batch (legal_business_id, batch_key, customer_id),
  KEY idx_customer_message_customer (legal_business_id, customer_id, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
