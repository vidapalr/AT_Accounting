-- 032: remember how many notes of each kind were counted when closing the day.
-- Safe to run twice. Old closings simply have no note counts.
ALTER TABLE acct_cash_closings
  ADD COLUMN IF NOT EXISTS denominations_json TEXT NULL;
