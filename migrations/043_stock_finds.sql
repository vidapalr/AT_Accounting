-- 043: extra stock found at a count is added to stock and recorded. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_stock_finds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  find_date DATE NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  total_cost DECIMAL(18,2) NOT NULL,
  remarks VARCHAR(500) DEFAULT NULL,
  status ENUM('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_finds_business (legal_business_id, find_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE acct_stock_count_lines
  ADD COLUMN IF NOT EXISTS found TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS find_id BIGINT UNSIGNED DEFAULT NULL;
