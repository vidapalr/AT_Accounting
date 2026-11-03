-- Terms and conditions printed on every bill, and kept on each bill as it was when the bill was made. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_bill_terms (
  legal_business_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  body TEXT NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS terms_text TEXT NULL;
