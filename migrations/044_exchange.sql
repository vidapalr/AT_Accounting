-- 044: exchange bills. A returned item's value is used as part payment on the new bill.
-- Safe to run twice.
ALTER TABLE acct_sales_payments
  MODIFY COLUMN payment_method ENUM('CASH','UPI','BANK_TRANSFER','CARD','OTHER','DISCOUNT','SET_OFF','EXCHANGE') NOT NULL;

ALTER TABLE acct_sales_payments
  ADD COLUMN IF NOT EXISTS exchange_return_id BIGINT UNSIGNED DEFAULT NULL;
