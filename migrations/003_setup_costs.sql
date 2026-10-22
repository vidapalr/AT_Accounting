-- 003: Set-up (pre-opening) costs
--
-- Lets an expense be marked as a set-up cost so reports can show
-- gross profit, operating profit (before set-up costs) and net profit
-- (after set-up costs) separately.
--
-- Idempotent: safe to run more than once.

-- 1) Mark on the expense (separate from its category)
ALTER TABLE acct_expenses
  ADD COLUMN IF NOT EXISTS is_setup_cost TINYINT(1) NOT NULL DEFAULT 0
  AFTER category;

-- 2) Ledger account for set-up costs
INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch,
  status, description
)
SELECT
  b.id, '6900', 'Set-up and Pre-opening Expenses',
  'EXPENSE', 'PRE_OPENING', 'DEBIT',
  1, 1,
  1, 0,
  'ACTIVE',
  'One-off costs of starting the business or a new branch. Reported below operating profit.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '6900'
);

-- 3) The three 12 Oct 2026 starting expenses were confirmed by the owner
--    as set-up costs (office supplies 4,400; miscellaneous 25,000 and 2,500).
UPDATE acct_expenses
SET is_setup_cost = 1
WHERE expense_no IN ('AB_AT_AT_EX_01', 'AB_AT_AT_EX_02', 'AB_AT_AT_EX_03')
  AND expense_date = '2026-10-12';

-- 4) Faster lookup of "has this record been posted?"
CREATE INDEX IF NOT EXISTS idx_journal_source
  ON acct_journal_entries (legal_business_id, source_type, source_id);
