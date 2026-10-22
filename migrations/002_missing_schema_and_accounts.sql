-- 002: Missing live-database structure, plus two ledger accounts
--
-- Parts 1 and 2 are existing repo scripts that were never applied to the
-- live database (scripts/add-funding-receipt-account.sql and
-- scripts/add-investor-bank-opening-balances.sql). Without them the
-- Funding Receipts page fails with "Unknown column 't.bank_account_id'"
-- and the Opening Balances pages reference a table that does not exist.
--
-- Parts 3 and 4 add ledger accounts the existing records need:
--   1310 Refundable Shop Deposits - the Rs 50,000 shop advance (asset)
--   6035 Packing and Packaging    - the PACKING expense category
--
-- Idempotent: safe to run more than once (needs MariaDB 10.0.2+ / 11.x).

-- 1) Funding receipts: which bank or cash account received the money
ALTER TABLE acct_funding_transactions
  ADD COLUMN IF NOT EXISTS bank_account_id BIGINT UNSIGNED NULL AFTER payment_method,
  ADD COLUMN IF NOT EXISTS cash_account_id BIGINT UNSIGNED NULL AFTER bank_account_id;

-- 2) Opening balances held in investor bank accounts
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

-- 3) Refundable deposits (asset). Requires a division, like Inventory.
INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch,
  status, description
)
SELECT
  b.id, '1310', 'Refundable Shop Deposits',
  'ASSET', 'DEPOSIT', 'DEBIT',
  1, 1,
  1, 0,
  'ACTIVE',
  'Refundable deposits and advances paid to landlords or others, '
  'recoverable in future (for example, a shop deposit).'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '1310'
);

-- 4) Packing expense (the app already has a PACKING expense category)
INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch,
  status, description
)
SELECT
  b.id, '6035', 'Packing and Packaging',
  'EXPENSE', 'OPERATING', 'DEBIT',
  1, 1,
  1, 0,
  'ACTIVE',
  'Bags, boxes, tape and other packing materials.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '6035'
);
