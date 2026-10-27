-- 033: orders placed on the public shop (textiles.abhiraminc.com). Safe to run twice.
-- An order starts as REQUESTED. Nothing touches stock or the books until staff turn it into a sale.
CREATE TABLE IF NOT EXISTS acct_online_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  order_no VARCHAR(20) NOT NULL,
  status ENUM('REQUESTED','CONFIRMED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(160) DEFAULT NULL,
  country VARCHAR(80) NOT NULL,
  address_line VARCHAR(300) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state_region VARCHAR(100) DEFAULT NULL,
  postal_code VARCHAR(20) DEFAULT NULL,
  customer_note VARCHAR(500) DEFAULT NULL,
  items_total DECIMAL(14,2) NOT NULL,
  shipping_charge DECIMAL(14,2) NOT NULL DEFAULT 0,
  staff_note VARCHAR(500) DEFAULT NULL,
  handled_by BIGINT UNSIGNED DEFAULT NULL,
  handled_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_online_order_no (legal_business_id, order_no),
  KEY idx_online_order_status (legal_business_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_online_order_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  detail VARCHAR(120) DEFAULT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_online_line_order (order_id),
  CONSTRAINT fk_online_line_order FOREIGN KEY (order_id) REFERENCES acct_online_orders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
