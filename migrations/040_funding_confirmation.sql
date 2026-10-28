-- 040: who confirmed an investor receipt against the bank statement, and when. Safe to run twice.
ALTER TABLE acct_funding_transactions
  ADD COLUMN IF NOT EXISTS verified_by BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS verified_at DATETIME NULL;
