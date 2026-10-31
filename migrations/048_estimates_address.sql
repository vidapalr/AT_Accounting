-- 048: customer address on bills, and estimates (quotes). Safe to run twice.
-- An estimate is a saved bill that moves no stock and no money. It has its own EST- number.
-- Converting it makes a normal invoice with a new invoice number; voiding it just closes it.
ALTER TABLE acct_sales_headers
  ADD COLUMN IF NOT EXISTS customer_address VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS is_estimate TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimate_no VARCHAR(40) NULL;

CREATE INDEX IF NOT EXISTS idx_sales_estimate ON acct_sales_headers (legal_business_id, estimate_no);
