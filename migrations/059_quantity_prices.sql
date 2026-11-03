-- 059: quantity prices. Optional price per piece for 4 to 9 pieces and for 10 or more pieces, per product size/colour.
-- (A percentage rule for all products is kept in business settings.) Safe to run twice.
ALTER TABLE acct_product_variants ADD COLUMN IF NOT EXISTS qty_price_4 DECIMAL(18,2) NULL;
ALTER TABLE acct_product_variants ADD COLUMN IF NOT EXISTS qty_price_10 DECIMAL(18,2) NULL;
