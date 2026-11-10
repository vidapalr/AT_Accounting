-- 076: owner accounts (money moved to the owner and paid out of it) and more places cash can go at closing.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_owner_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  note VARCHAR(300) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_owner_account_name (legal_business_id, account_name)
);

ALTER TABLE acct_cash_closings MODIFY COLUMN taken_to ENUM('BANK','OWNER','CASH') NULL;
ALTER TABLE acct_cash_closings ADD COLUMN IF NOT EXISTS taken_cash_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_cash_closings ADD COLUMN IF NOT EXISTS taken_owner_account_id BIGINT UNSIGNED NULL;

ALTER TABLE acct_expense_payments ADD COLUMN IF NOT EXISTS owner_account_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_purchase_payments ADD COLUMN IF NOT EXISTS owner_account_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_owner_money ADD COLUMN IF NOT EXISTS owner_account_id BIGINT UNSIGNED NULL;
