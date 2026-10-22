-- 005: Customer returns, refunds and damaged stock
--
--   acct_sales_returns / acct_sales_return_lines  pieces a customer brings back
--   acct_sales_refunds                            money paid back to the customer
--   acct_stock_damages                            stock damaged or lost in the shop
--   accounts 4210 Sales Returns and 5150 Damaged and Lost Stock
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_sales_returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  sale_id BIGINT UNSIGNED NOT NULL,
  return_no VARCHAR(60) NOT NULL,
  return_date DATE NOT NULL,
  reason ENUM('DEFECTIVE','WRONG_SIZE','CUSTOMER_CHANGED_MIND','OTHER') NOT NULL,
  remarks VARCHAR(500) NULL,
  gross_value DECIMAL(18,2) NOT NULL,
  refund_value DECIMAL(18,2) NOT NULL,
  status ENUM('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_return_no (legal_business_id, return_no),
  KEY idx_sales_return_sale (legal_business_id, sale_id)
);

CREATE TABLE IF NOT EXISTS acct_sales_return_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  return_id BIGINT UNSIGNED NOT NULL,
  sale_line_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  gross_value DECIMAL(18,2) NOT NULL,
  refund_value DECIMAL(18,2) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  total_cost DECIMAL(18,2) NOT NULL,
  item_condition ENUM('RESELLABLE','DAMAGED') NOT NULL,
  PRIMARY KEY (id),
  KEY idx_return_lines_return (return_id),
  KEY idx_return_lines_sale_line (legal_business_id, sale_line_id)
);

CREATE TABLE IF NOT EXISTS acct_sales_refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  return_id BIGINT UNSIGNED NOT NULL,
  refund_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  payment_method ENUM('CASH','UPI','BANK_TRANSFER','CARD','OTHER') NOT NULL,
  bank_account_id BIGINT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  remarks VARCHAR(300) NULL,
  status ENUM('RECORDED','VOID') NOT NULL DEFAULT 'RECORDED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sales_refund_return (legal_business_id, return_id)
);

CREATE TABLE IF NOT EXISTS acct_stock_damages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  damage_date DATE NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  total_cost DECIMAL(18,2) NOT NULL,
  reason ENUM('DAMAGED','LOST','OTHER') NOT NULL,
  remarks VARCHAR(500) NULL,
  status ENUM('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_damage_variant (legal_business_id, location_id, variant_id)
);

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '4210', 'Sales Returns', 'REVENUE', 'CONTRA_REVENUE', 'DEBIT',
       1, 1, 1, 1, 'ACTIVE',
       'Value of goods customers returned. Reduces sales.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '4210'
);

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '5150', 'Damaged and Lost Stock', 'EXPENSE', 'COGS', 'DEBIT',
       1, 1, 1, 0, 'ACTIVE',
       'Cost of stock that was damaged or lost and cannot be sold. Reduces gross profit.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '5150'
);
