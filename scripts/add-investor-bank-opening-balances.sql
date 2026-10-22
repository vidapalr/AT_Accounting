CREATE TABLE IF NOT EXISTS acct_opening_investor_bank_balances (
  legal_business_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  bank_account_id BIGINT UNSIGNED NOT NULL,
  opening_amount DECIMAL(18, 2) NOT NULL,
  PRIMARY KEY (batch_id, bank_account_id),
  KEY idx_opening_investor_bank_business (
    legal_business_id,
    bank_account_id
  )
);
