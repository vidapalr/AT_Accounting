-- 055: make sure the Loans Payable account (2120) exists. Money received on a Loan agreement is booked here
-- instead of Investor Capital. Safe to run twice.
INSERT INTO acct_chart_of_accounts (legal_business_id, account_code, account_name, account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account, requires_division, requires_branch, status, description)
SELECT b.id, '2120', 'Loans Payable', 'LIABILITY', 'LOAN', 'CREDIT', 1, 1, 0, 0, 'ACTIVE',
  'Money received from investors on a Loan agreement, still to be paid back.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '2120');
