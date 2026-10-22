-- 006: Carry set-up costs as an asset instead of charging them to profit
--
-- The owner decided the 12 Oct 2026 starting costs (paid from the investor's
-- bank and the group bank) are an investment in the business, not a trading
-- loss. Each set-up expense is still recorded to 6900, then a matching
-- entry moves it to this asset account, so profit is not reduced and the
-- cost stays visible on the balance sheet until it is written off.
--
-- Idempotent: safe to run more than once.
INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '1320', 'Set-up Costs Not Yet Written Off',
       'ASSET', 'DEFERRED_EXPENSE', 'DEBIT',
       1, 1, 1, 0, 'ACTIVE',
       'One-off costs of starting the business, carried as an asset. Written off to expenses later if the owner or accountant decides.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '1320'
);
