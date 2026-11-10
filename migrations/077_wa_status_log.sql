-- 077: every status WhatsApp reports for a message we sent (sent, delivered, read, failed), with the time.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_wa_status_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  wa_message_id VARCHAR(100) NOT NULL,
  status VARCHAR(12) NOT NULL,
  error_code INT NULL,
  error_reason VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wa_status_msg (wa_message_id)
);
