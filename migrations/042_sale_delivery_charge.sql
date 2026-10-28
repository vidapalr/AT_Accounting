-- 042: delivery (shipping) charge on a sale bill. Safe to run twice.
ALTER TABLE acct_sales_headers
  ADD COLUMN IF NOT EXISTS shipping_charge DECIMAL(18,2) NOT NULL DEFAULT 0.00;

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '4300', 'Delivery Income', 'REVENUE', 'OTHER_REVENUE', 'CREDIT',
       1, 1, 1, 1, 'ACTIVE',
       'Delivery or shipping charged to customers on their bills.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '4300'
);
