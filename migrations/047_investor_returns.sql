-- 047: returns paid to investors. Each payment is marked "share of profit" (not a cost) or "cost" (reduces profit).
-- Adds the two ledger accounts it posts to. Safe to run twice.
ALTER TABLE acct_funding_transactions
  ADD COLUMN IF NOT EXISTS return_treatment ENUM('PROFIT_SHARE','COST') NULL;

INSERT INTO acct_chart_of_accounts (legal_business_id, account_code, account_name, account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account, requires_division, requires_branch, status, description)
SELECT b.id, '3250', 'Investor Profit Share Paid', 'EQUITY', 'DISTRIBUTION', 'DEBIT', 1, 1, 0, 0, 'ACTIVE',
  'Profit shared out to investors. A distribution of profit, not a cost: it does not reduce profit in Profit and loss.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '3250');

INSERT INTO acct_chart_of_accounts (legal_business_id, account_code, account_name, account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account, requires_division, requires_branch, status, description)
SELECT b.id, '6120', 'Investor Returns (cost)', 'EXPENSE', 'OPERATING', 'DEBIT', 1, 1, 0, 0, 'ACTIVE',
  'Returns paid to investors that the accountant treats as a cost, like interest. Reduces profit.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '6120');
