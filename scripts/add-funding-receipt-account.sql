ALTER TABLE acct_funding_transactions
  ADD COLUMN bank_account_id BIGINT UNSIGNED NULL
    AFTER payment_method,
  ADD COLUMN cash_account_id BIGINT UNSIGNED NULL
    AFTER bank_account_id;
