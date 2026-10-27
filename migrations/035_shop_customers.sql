-- 035: customer accounts for the public shop, and the link from an online order to the bill. Safe to run twice.
-- These are website customers (email + password), separate from staff logins.
CREATE TABLE IF NOT EXISTS acct_shop_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(160) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  status ENUM('ACTIVE','BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_customer_email (legal_business_id, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_shop_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_session_token (token_hash),
  KEY idx_shop_session_customer (customer_id),
  CONSTRAINT fk_shop_session_customer FOREIGN KEY (customer_id) REFERENCES acct_shop_customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE acct_online_orders
  ADD COLUMN IF NOT EXISTS shop_customer_id BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS sale_id BIGINT UNSIGNED NULL;
