-- 023: Physical stock count and low-stock level
--
--   acct_stock_counts        one count of one place on one day
--   acct_stock_count_lines   each item counted: what the books said, what was counted
--   acct_product_variants.low_stock_level   the minimum you want to keep of an item
--
-- Run once. If phpMyAdmin says the column low_stock_level already exists, that part is done.

ALTER TABLE acct_product_variants ADD COLUMN low_stock_level DECIMAL(14,3) NULL;

CREATE TABLE IF NOT EXISTS acct_stock_counts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  count_no VARCHAR(60) NOT NULL,
  count_date DATE NOT NULL,
  note VARCHAR(300) NULL,
  status ENUM('COUNTED','SETTLED') NOT NULL DEFAULT 'COUNTED',
  counted_by BIGINT UNSIGNED NOT NULL,
  settled_by BIGINT UNSIGNED NULL,
  settled_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_count_no (legal_business_id, count_no),
  KEY idx_stock_count_location (legal_business_id, location_id)
);

CREATE TABLE IF NOT EXISTS acct_stock_count_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  count_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  books_qty DECIMAL(14,3) NOT NULL,
  counted_qty DECIMAL(14,3) NOT NULL,
  difference DECIMAL(14,3) NOT NULL,
  written_off TINYINT(1) NOT NULL DEFAULT 0,
  damage_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_count_line (count_id, variant_id),
  KEY idx_count_line_count (legal_business_id, count_id)
);
