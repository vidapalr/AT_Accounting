-- 036: password reset links for website customers. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_shop_password_resets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_reset_token (token_hash),
  KEY idx_shop_reset_customer (customer_id),
  CONSTRAINT fk_shop_reset_customer FOREIGN KEY (customer_id) REFERENCES acct_shop_customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
