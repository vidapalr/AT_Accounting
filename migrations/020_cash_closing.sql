-- 020: Daily cash closing
--
--   acct_cash_closings   one row per cash drawer per day: what the system expected
--                        in the drawer, what was actually counted, and the difference.
--
-- A control record only: it does not post any accounting entry.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_cash_closings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  cash_account_id BIGINT UNSIGNED NOT NULL,
  closing_date DATE NOT NULL,
  opening_amount DECIMAL(18,2) NOT NULL,
  cash_in DECIMAL(18,2) NOT NULL,
  cash_out DECIMAL(18,2) NOT NULL,
  taken_out DECIMAL(18,2) NOT NULL DEFAULT 0,
  expected_amount DECIMAL(18,2) NOT NULL,
  counted_amount DECIMAL(18,2) NOT NULL,
  difference DECIMAL(18,2) NOT NULL,
  note VARCHAR(300) NULL,
  closed_by BIGINT UNSIGNED NOT NULL,
  closed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  redone_by BIGINT UNSIGNED NULL,
  redone_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cash_closing_day (legal_business_id, cash_account_id, closing_date)
);
