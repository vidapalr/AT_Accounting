ALTER TABLE acct_sales_payments
  ADD COLUMN payment_account_type ENUM('BANK', 'CASH', 'CARD', 'UPI', 'OTHERS') NULL
    AFTER payment_date,
  ADD COLUMN bank_account_id BIGINT UNSIGNED NULL
    AFTER payment_account_type,
  ADD COLUMN cash_account_id BIGINT UNSIGNED NULL
    AFTER bank_account_id;
