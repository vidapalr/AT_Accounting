-- 018: Supplier returns (debit notes) and free stock
--
--   acct_supplier_returns / _lines          goods sent back to a supplier (debit note)
--   acct_supplier_refunds                   money the supplier paid back
--   acct_supplier_return_replacements       replacement purchases linked to a return
--   acct_free_stock / _lines                stock given away free (a business expense)
--   accounts 6045 Gifts and Free Stock, 5160 Loss on Supplier Returns
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_supplier_returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  purchase_id BIGINT UNSIGNED NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  return_no VARCHAR(60) NOT NULL,
  return_date DATE NOT NULL,
  reason ENUM('DAMAGED','WRONG_ITEM','EXTRA','OTHER') NOT NULL,
  remarks VARCHAR(500) NULL,
  supplier_note_no VARCHAR(100) NULL,
  cost_value DECIMAL(18,2) NOT NULL,
  agreed_value DECIMAL(18,2) NOT NULL,
  status ENUM('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_return_no (legal_business_id, return_no),
  KEY idx_supplier_return_supplier (legal_business_id, supplier_id),
  KEY idx_supplier_return_purchase (legal_business_id, purchase_id)
);

CREATE TABLE IF NOT EXISTS acct_supplier_return_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  return_id BIGINT UNSIGNED NOT NULL,
  purchase_line_id BIGINT UNSIGNED NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  total_cost DECIMAL(18,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_supplier_return_lines_return (return_id),
  KEY idx_supplier_return_lines_pline (legal_business_id, purchase_line_id)
);

CREATE TABLE IF NOT EXISTS acct_supplier_refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  return_id BIGINT UNSIGNED NULL,
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
  KEY idx_supplier_refund_supplier (legal_business_id, supplier_id),
  KEY idx_supplier_refund_return (legal_business_id, return_id)
);

CREATE TABLE IF NOT EXISTS acct_supplier_return_replacements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  return_id BIGINT UNSIGNED NOT NULL,
  purchase_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_replacement (legal_business_id, return_id, purchase_id)
);

CREATE TABLE IF NOT EXISTS acct_free_stock (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  entry_no VARCHAR(60) NOT NULL,
  given_date DATE NOT NULL,
  given_to VARCHAR(150) NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  reason VARCHAR(300) NOT NULL,
  status ENUM('WAITING','APPROVED','REJECTED') NOT NULL DEFAULT 'WAITING',
  total_cost DECIMAL(18,2) NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  reject_reason VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_free_stock_no (legal_business_id, entry_no),
  KEY idx_free_stock_status (legal_business_id, status, given_date)
);

CREATE TABLE IF NOT EXISTS acct_free_stock_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  free_stock_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(18,4) NULL,
  total_cost DECIMAL(18,2) NULL,
  PRIMARY KEY (id),
  KEY idx_free_stock_lines_entry (legal_business_id, free_stock_id)
);

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '6045', 'Gifts and Free Stock', 'EXPENSE', 'OPERATING', 'DEBIT',
       1, 1, 1, 0, 'ACTIVE',
       'Cost of stock given away free (gifts, samples, promotions, staff). A business expense.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '6045'
);

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '5160', 'Loss on Supplier Returns', 'EXPENSE', 'COGS', 'DEBIT',
       1, 1, 1, 0, 'ACTIVE',
       'Cost of goods sent back to a supplier that the supplier credited for less than they cost.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM acct_chart_of_accounts c
  WHERE c.legal_business_id = b.id AND c.account_code = '5160'
);
