-- 017: GST-ready data, switched OFF. Nothing changes on invoices until GST is turned on.
-- Adds the columns that are expensive to add later once many records exist.
-- Safe to run more than once (needs MariaDB 10.0.2+).

ALTER TABLE acct_products
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8) NULL,
  ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) NULL;

ALTER TABLE acct_sales_headers
  ADD COLUMN IF NOT EXISTS gst_applied TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS place_of_supply VARCHAR(60) NULL;

ALTER TABLE acct_sales_lines
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8) NULL,
  ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) NULL,
  ADD COLUMN IF NOT EXISTS taxable_value DECIMAL(14,2) NULL,
  ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cess_amount DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE acct_purchase_lines
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(8) NULL,
  ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) NULL,
  ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itc_eligible TINYINT(1) NOT NULL DEFAULT 1;

-- GST settings live in acct_business_settings (keys: gst_status, gst_gstin,
-- gst_state_code, gst_prices_inclusive, gst_effective_date). Default: not registered.
INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT id, 'gst_status', 'NOT_REGISTERED' FROM acct_legal_businesses;
INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT id, 'gst_prices_inclusive', '1' FROM acct_legal_businesses;
