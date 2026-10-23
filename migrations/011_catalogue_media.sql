-- 011: product photos and videos, and "new stock arrived" events.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_product_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  media_type ENUM('IMAGE','VIDEO') NOT NULL,
  -- File name inside the media folder (not a path).
  storage_key VARCHAR(80) NOT NULL,
  mime_type VARCHAR(60) NOT NULL,
  original_name VARCHAR(200) DEFAULT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  caption VARCHAR(200) DEFAULT NULL,
  is_cover TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('ACTIVE','REMOVED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_key (storage_key),
  KEY idx_media_product (legal_business_id, product_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- One row each time stock arrives (goods receipt). Social posts, WhatsApp
-- updates and the online shop read these instead of editing purchase code.
CREATE TABLE IF NOT EXISTS acct_stock_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('NEW_STOCK') NOT NULL DEFAULT 'NEW_STOCK',
  source_type VARCHAR(30) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED DEFAULT NULL,
  quantity DECIMAL(18,3) NOT NULL,
  status ENUM('NEW','SHARED','DISMISSED') NOT NULL DEFAULT 'NEW',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  shared_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_event (legal_business_id, source_type, source_id, variant_id),
  KEY idx_stock_event_status (legal_business_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
