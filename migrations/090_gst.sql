-- 090: Full GST (Accounting > GST returns and payments; GST settings; bills, purchases, expenses, returns).
-- Adds: the kind of bill and buyer GSTIN on each sale, GST on delivery, credit-note tax on customer
-- returns, supplier GST status on purchases, tax taken back on supplier returns, GST on expenses
-- (input credit or reverse charge), the 5% / 18% price rule on products, GST payments, and the
-- GST ledger accounts for every company.
-- Nothing changes while GST settings say "Not registered": every new column starts empty or zero.
-- Idempotent: safe to run more than once. No existing figures or posted entries change.

-- 1) Sales: kind of bill, buyer GSTIN, GST on the delivery charge (place_of_supply holds the state code)
ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS invoice_kind ENUM('PLAIN','TAX_INVOICE','BILL_OF_SUPPLY') NOT NULL DEFAULT 'PLAIN';
ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS buyer_gstin VARCHAR(15) NULL;
ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS shipping_gst_rate DECIMAL(5,2) NULL;
ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS shipping_cgst DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS shipping_sgst DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS shipping_igst DECIMAL(14,2) NOT NULL DEFAULT 0;

-- 2) Customer returns: the GST given back (credit note)
ALTER TABLE acct_sales_returns ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_sales_returns ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_sales_returns ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_sales_returns ADD COLUMN IF NOT EXISTS delivery_tax DECIMAL(14,2) NOT NULL DEFAULT 0;

-- 3) Purchases: the supplier's GST status when the bill was entered, and the GST on the supplier's bill
ALTER TABLE acct_purchase_headers ADD COLUMN IF NOT EXISTS gst_treatment ENUM('NONE','REGULAR','UNREGISTERED','COMPOSITION') NOT NULL DEFAULT 'NONE';
ALTER TABLE acct_purchase_headers ADD COLUMN IF NOT EXISTS supplier_gstin VARCHAR(15) NULL;
ALTER TABLE acct_purchase_headers ADD COLUMN IF NOT EXISTS bill_tax_total DECIMAL(14,2) NULL;
ALTER TABLE acct_suppliers ADD COLUMN IF NOT EXISTS gst_composition TINYINT(1) NOT NULL DEFAULT 0;

-- 4) Supplier returns: input credit taken back (debit note)
ALTER TABLE acct_supplier_returns ADD COLUMN IF NOT EXISTS itc_cgst DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_supplier_returns ADD COLUMN IF NOT EXISTS itc_sgst DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_supplier_returns ADD COLUMN IF NOT EXISTS itc_igst DECIMAL(14,2) NOT NULL DEFAULT 0;

-- 5) Expenses: GST on the bill (input credit) or GST the business pays itself (reverse charge)
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS gst_mode ENUM('NONE','ITC','RCM') NOT NULL DEFAULT 'NONE';
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS vendor_gstin VARCHAR(15) NULL;
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) NULL;
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) NOT NULL DEFAULT 0;

-- 6) Products: a second rate above a price per piece (garments: 5% up to Rs 2,500, 18% above)
ALTER TABLE acct_products ADD COLUMN IF NOT EXISTS gst_rate_high DECIMAL(5,2) NULL;
ALTER TABLE acct_products ADD COLUMN IF NOT EXISTS gst_price_limit DECIMAL(12,2) NULL;

-- 7) GST paid to the government (monthly return, or quarterly for composition)
CREATE TABLE IF NOT EXISTS acct_gst_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  payment_no VARCHAR(20) NOT NULL,                     -- automatic, e.g. GSTP-0001
  scheme ENUM('REGULAR','COMPOSITION') NOT NULL DEFAULT 'REGULAR',
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  paid_on DATE NOT NULL,
  -- GST settled, by kind (credit used + cash)
  settled_cgst DECIMAL(14,2) NOT NULL DEFAULT 0,
  settled_sgst DECIMAL(14,2) NOT NULL DEFAULT 0,
  settled_igst DECIMAL(14,2) NOT NULL DEFAULT 0,
  -- input credit used, by the kind of credit
  itc_cgst DECIMAL(14,2) NOT NULL DEFAULT 0,
  itc_sgst DECIMAL(14,2) NOT NULL DEFAULT 0,
  itc_igst DECIMAL(14,2) NOT NULL DEFAULT 0,
  rcm_cash DECIMAL(14,2) NOT NULL DEFAULT 0,           -- reverse-charge GST (always paid in cash)
  composition_tax DECIMAL(14,2) NOT NULL DEFAULT 0,    -- composition scheme tax for the quarter
  interest_fee DECIMAL(14,2) NOT NULL DEFAULT 0,       -- interest and late fee
  cash_total DECIMAL(14,2) NOT NULL DEFAULT 0,
  paid_from ENUM('BANK','CASH') NOT NULL DEFAULT 'BANK',
  bank_account_id BIGINT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  challan_ref VARCHAR(40) NULL,                        -- CPIN / CIN from the GST portal (outside identifier)
  note VARCHAR(250) NULL,
  status ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gst_payments_no (legal_business_id, payment_no),
  KEY idx_gst_payments_business (legal_business_id, status, period_to),
  CONSTRAINT fk_gst_payments_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8) GST ledger accounts for every company (codes can be re-mapped on Accounting > Account mapping)
INSERT INTO acct_chart_of_accounts (legal_business_id, account_code, account_name, account_type, account_subtype, normal_balance,
                                    is_posting_account, is_system_account, requires_division, requires_branch, status, description)
SELECT b.id, a.code, a.name, a.type, a.subtype, a.side, 1, 1, 0, 0, 'ACTIVE', a.descr
  FROM acct_legal_businesses b
  JOIN (
    SELECT '1410' AS code, 'GST input credit - CGST' AS name, 'ASSET' AS type, 'TAX' AS subtype, 'DEBIT' AS side, 'Central GST paid on purchases and expenses, to set off against GST on sales.' AS descr
    UNION ALL SELECT '1411', 'GST input credit - SGST', 'ASSET', 'TAX', 'DEBIT', 'State GST paid on purchases and expenses, to set off against GST on sales.'
    UNION ALL SELECT '1412', 'GST input credit - IGST', 'ASSET', 'TAX', 'DEBIT', 'Integrated GST paid on purchases from other states, to set off against GST on sales.'
    UNION ALL SELECT '2310', 'GST on sales - CGST', 'LIABILITY', 'TAX', 'CREDIT', 'Central GST collected on sales, owed to the government.'
    UNION ALL SELECT '2311', 'GST on sales - SGST', 'LIABILITY', 'TAX', 'CREDIT', 'State GST collected on sales, owed to the government.'
    UNION ALL SELECT '2312', 'GST on sales - IGST', 'LIABILITY', 'TAX', 'CREDIT', 'Integrated GST collected on sales to other states, owed to the government.'
    UNION ALL SELECT '2315', 'GST to pay on reverse charge', 'LIABILITY', 'TAX', 'CREDIT', 'GST the business must pay itself on reverse-charge purchases (paid in cash).'
    UNION ALL SELECT '6130', 'Composition GST', 'EXPENSE', 'OPERATING', 'DEBIT', 'Tax paid under the composition scheme (a share of turnover).'
    UNION ALL SELECT '6140', 'GST interest and late fee', 'EXPENSE', 'OPERATING', 'DEBIT', 'Interest and late fees paid on GST returns.'
  ) a
 WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = a.code);

-- 9) Settings: composition rate (1% for traders) and prices that include GST
INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT id, 'gst_composition_rate', '1' FROM acct_legal_businesses;
