-- 037: Owner money in and out of the business (proprietor capital and drawings).
-- Money the owner puts into a business bank or cash account is Proprietor Capital (3000);
-- money taken back out reduces it. Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS acct_owner_money (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  entry_no VARCHAR(40) NOT NULL,
  direction ENUM('IN','OUT') NOT NULL,
  entry_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  account_kind ENUM('BANK','CASH') NOT NULL,
  bank_account_id BIGINT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  payment_method ENUM('CASH','UPI','BANK_TRANSFER','CHEQUE') NOT NULL,
  reference VARCHAR(80) NULL,
  note VARCHAR(300) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_owner_money_no (legal_business_id, entry_no),
  KEY idx_owner_money_date (legal_business_id, entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
