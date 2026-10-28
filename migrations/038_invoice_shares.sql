-- 038: private links so a customer can open their bill from WhatsApp. Idempotent.
CREATE TABLE IF NOT EXISTS acct_invoice_shares (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  sale_id BIGINT UNSIGNED NOT NULL,
  token CHAR(32) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_share_sale (legal_business_id, sale_id),
  UNIQUE KEY uq_invoice_share_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
