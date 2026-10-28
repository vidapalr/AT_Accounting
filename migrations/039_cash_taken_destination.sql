-- 039: where the cash taken away at closing went, so it reaches the books.
-- BANK = deposited to a business bank account; OWNER = taken by the owner (reduces proprietor capital).
-- Older closings keep NULL and are not posted. Safe to run twice.
ALTER TABLE acct_cash_closings
  ADD COLUMN IF NOT EXISTS taken_to ENUM('BANK','OWNER') NULL,
  ADD COLUMN IF NOT EXISTS taken_bank_id BIGINT UNSIGNED NULL;
