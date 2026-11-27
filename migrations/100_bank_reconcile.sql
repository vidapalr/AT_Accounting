-- 100: Match a bank account with its statement, line by line (Money > Match with bank statement).
-- A tick says "this book entry is on the bank statement". A check records the bank's balance on a date
-- and that the ticked entries added up to it. Nothing here changes the ledger.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_bank_reconcile_ticks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  bank_account_id BIGINT UNSIGNED NOT NULL,
  journal_line_id BIGINT UNSIGNED NOT NULL,
  ticked_by BIGINT UNSIGNED NOT NULL,
  ticked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bank_tick_line (legal_business_id, journal_line_id),
  KEY idx_bank_tick_account (legal_business_id, bank_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_bank_reconcile_checks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  bank_account_id BIGINT UNSIGNED NOT NULL,
  statement_date DATE NOT NULL,
  statement_balance DECIMAL(18,2) NOT NULL,
  books_balance DECIMAL(18,2) NOT NULL,
  ticked_balance DECIMAL(18,2) NOT NULL,
  done_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bank_check (legal_business_id, bank_account_id, statement_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
