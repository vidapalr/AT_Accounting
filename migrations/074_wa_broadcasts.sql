-- 074: automatic new-stock messages on WhatsApp (item 3.7) and delivery results from Meta.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_wa_broadcasts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'NEW_STOCK',
  product_id BIGINT UNSIGNED NOT NULL,
  event_ids VARCHAR(500) NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  language_code VARCHAR(12) NOT NULL,
  image_media_id BIGINT UNSIGNED NOT NULL,
  product_label VARCHAR(200) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'SENDING',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wa_bc (legal_business_id, created_at)
);

CREATE TABLE IF NOT EXISTS acct_wa_broadcast_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  broadcast_id BIGINT UNSIGNED NOT NULL,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'QUEUED',
  wa_message_id VARCHAR(100) NULL,
  error_code INT NULL,
  error_reason VARCHAR(300) NULL,
  sent_at DATETIME NULL,
  UNIQUE KEY uq_wa_bc_cust (broadcast_id, customer_id),
  KEY idx_wa_rcpt_status (broadcast_id, status),
  KEY idx_wa_rcpt_msg (wa_message_id),
  KEY idx_wa_rcpt_cust (legal_business_id, customer_id, event_key),
  KEY idx_wa_rcpt_sent (legal_business_id, sent_at)
);

-- What Meta later says about each message we sent: delivered, read or failed (and why).
CREATE TABLE IF NOT EXISTS acct_wa_delivery (
  wa_message_id VARCHAR(100) NOT NULL PRIMARY KEY,
  status VARCHAR(12) NOT NULL,
  error_code INT NULL,
  error_reason VARCHAR(300) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE acct_customers ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at DATETIME NULL;
