-- 086: The label stored on a sale payment received into a business bank account was the company name
-- (ABHIRAM_GROUP). It becomes the neutral word BUSINESS, so the same app works for any company.
-- Run this BEFORE using the new code: the new code writes BUSINESS.
-- Idempotent: safe to run more than once. Amounts and postings do not change.

ALTER TABLE acct_sales_payments
  MODIFY payment_account ENUM('ABHIRAM_GROUP','BUSINESS','INVESTMENT_BANKING','CASH') DEFAULT NULL;

UPDATE acct_sales_payments SET payment_account = 'BUSINESS' WHERE payment_account = 'ABHIRAM_GROUP';

ALTER TABLE acct_sales_payments
  MODIFY payment_account ENUM('BUSINESS','INVESTMENT_BANKING','CASH') DEFAULT NULL;
