-- 057: who an expense is paid to (printed on the voucher). Safe to run twice.
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS payee_name VARCHAR(150) NULL AFTER description;
