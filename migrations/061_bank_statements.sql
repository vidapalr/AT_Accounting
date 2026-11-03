-- 061: Bank statement lines (item 2.11, part 2)
-- Lines uploaded from a bank's CSV file, and which book entry each one matches.
-- Nothing here changes the ledger. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_bank_statement_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  bank_account_id BIGINT UNSIGNED NOT NULL,
  line_date DATE NOT NULL,
  description VARCHAR(500) NOT NULL,
  money_out DECIMAL(18,2) NOT NULL DEFAULT 0,
  money_in DECIMAL(18,2) NOT NULL DEFAULT 0,
  balance DECIMAL(18,2) NULL,
  line_hash CHAR(40) NOT NULL,
  journal_line_id BIGINT UNSIGNED NULL,
  status ENUM('UNMATCHED','MATCHED','IGNORED') NOT NULL DEFAULT 'UNMATCHED',
  note VARCHAR(300) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bank_line (legal_business_id, bank_account_id, line_hash),
  KEY idx_bank_line_date (legal_business_id, bank_account_id, line_date),
  KEY idx_bank_line_journal (journal_line_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
