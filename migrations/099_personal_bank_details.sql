-- 099: Bank details on the owner's personal accounts (My money).
-- Account holder name, IFSC and the full account number. The account number is stored encrypted
-- (same key as portal passwords) and only the owner can show it; lists show the last 4 digits.
-- Credit cards keep only the last 4 digits (never the full card number or CVV).
-- Run after 098_personal_money. Idempotent: safe to run more than once. No business figures change.

ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS account_holder VARCHAR(150) NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS ifsc CHAR(11) NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS account_no_cipher VARBINARY(128) NULL;
