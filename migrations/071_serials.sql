-- Piece-by-piece tracking for one-of-a-kind items (off unless switched on per item). Safe to run twice.
ALTER TABLE acct_product_variants ADD COLUMN IF NOT EXISTS track_serial TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS acct_serials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  serial_no VARCHAR(30) NOT NULL,
  status ENUM('IN_STOCK','SOLD') NOT NULL DEFAULT 'IN_STOCK',
  sale_id BIGINT UNSIGNED NULL,
  sold_on DATE NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_serial_no (legal_business_id, serial_no),
  KEY idx_serial_variant (legal_business_id, variant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
