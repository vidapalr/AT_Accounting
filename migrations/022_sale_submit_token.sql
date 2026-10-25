-- 022: Stop the same bill being saved twice (double tap on "Confirm sale").
-- Each bill form carries a one-time token; the same token can only create one bill.
-- Idempotent only if run once: if phpMyAdmin says the column already exists, it is already done.

ALTER TABLE acct_sales_headers
  ADD COLUMN submit_token CHAR(36) NULL,
  ADD UNIQUE KEY uq_sales_submit_token (legal_business_id, submit_token);
