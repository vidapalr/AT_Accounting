-- 034: richer online product details, colour photos, crossed-out prices and offers (store / online / both).
-- Safe to run twice. Nothing existing is changed.
ALTER TABLE acct_products
  ADD COLUMN IF NOT EXISTS highlights TEXT NULL,
  ADD COLUMN IF NOT EXISTS care_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS size_guide TEXT NULL;

ALTER TABLE acct_product_variants
  ADD COLUMN IF NOT EXISTS compare_price DECIMAL(14,2) NULL,
  ADD COLUMN IF NOT EXISTS photo_media_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS acct_offers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  offer_name VARCHAR(80) NOT NULL,
  channel ENUM('STORE','ONLINE','BOTH') NOT NULL DEFAULT 'BOTH',
  kind ENUM('PERCENT','AMOUNT_OFF','FIXED_PRICE') NOT NULL,
  offer_value DECIMAL(14,2) NOT NULL,
  scope ENUM('ALL','FABRIC','PRODUCTS') NOT NULL DEFAULT 'ALL',
  fabric VARCHAR(100) DEFAULT NULL,
  starts_on DATE DEFAULT NULL,
  ends_on DATE DEFAULT NULL,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_offers_business (legal_business_id, status, starts_on, ends_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_offer_products (
  offer_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (offer_id, product_id),
  CONSTRAINT fk_offer_products_offer FOREIGN KEY (offer_id) REFERENCES acct_offers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- What an online order line was sold at, and which offer gave the price.
ALTER TABLE acct_online_order_lines
  ADD COLUMN IF NOT EXISTS list_price DECIMAL(14,2) NULL,
  ADD COLUMN IF NOT EXISTS offer_name VARCHAR(80) NULL;
