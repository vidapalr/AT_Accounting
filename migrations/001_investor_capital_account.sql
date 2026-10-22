-- 001: Investor Capital ledger account
--
-- Investor money received or spent through the investor's own bank is
-- held as capital for now (owner decision, Oct 2026). Capital can be
-- reclassified to a loan later through a dated journal.
--
-- Account 3200 uses the existing CAPITAL subtype, so manual journals
-- cannot post to it (journal-posting-actions.ts RESTRICTED_TYPES).
-- Only the controlled investor-funding posting path may use it.
--
-- Idempotent: safe to run more than once.

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch,
  status, description
)
SELECT
  b.id, '3200', 'Investor Capital',
  'EQUITY', 'CAPITAL', 'CREDIT',
  1, 1,
  0, 0,
  'ACTIVE',
  'Running balance of investor funds: credited when the investor '
  'pays suppliers or expenses from his own bank, debited when sales '
  'money lands in his bank or when funds are refunded to him.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1
  FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id
    AND c.account_code = '3200'
);
