-- 060: own selling prices per product size/colour. When set, they are used on bills (usual price and minimum)
-- and for the online shop (maximum) instead of the prices that came with the stock. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_selling_prices (
  legal_business_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  min_price DECIMAL(18,2) NULL,
  max_price DECIMAL(18,2) NULL,
  suggested_price DECIMAL(18,2) NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (legal_business_id, variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
