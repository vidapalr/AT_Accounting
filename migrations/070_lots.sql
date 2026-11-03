-- Lot (dye batch) names on purchase lines and on sale lines, so a complaint can be traced. Safe to run twice.
ALTER TABLE acct_purchase_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(60) NULL;
ALTER TABLE acct_sales_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(60) NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_lines_lot ON acct_purchase_lines (legal_business_id, lot_no);
CREATE INDEX IF NOT EXISTS idx_sales_lines_lot ON acct_sales_lines (legal_business_id, lot_no);
