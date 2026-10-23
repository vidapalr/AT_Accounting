-- 016: a selling price per size/colour for the online shop and Meta catalogue.
-- Safe to run more than once (needs MariaDB 10.0.2+).
ALTER TABLE acct_product_variants
  ADD COLUMN IF NOT EXISTS shop_price DECIMAL(12,2) NULL;
