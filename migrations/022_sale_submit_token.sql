-- 022: Stop the same bill being saved twice (double tap on "Confirm sale").
-- Each bill form carries a one-time token; the same token can only create one bill.
-- Safe to run twice.

ALTER TABLE acct_sales_headers
  ADD COLUMN IF NOT EXISTS submit_token CHAR(36) NULL,
  ADD UNIQUE INDEX IF NOT EXISTS uq_sales_submit_token (legal_business_id, submit_token);
