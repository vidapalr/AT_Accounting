-- 028: Purchase orders
--
-- An order is a promise to buy, written before the goods arrive. It moves no money and
-- touches no stock or ledger. When the goods arrive, one button turns it into an ordinary
-- purchase DRAFT (items and prices copied), which is then posted the usual way.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_purchase_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  order_no VARCHAR(40) NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  order_date DATE NOT NULL,
  expected_date DATE NULL,
  status ENUM('OPEN','RECEIVED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  purchase_id BIGINT UNSIGNED NULL,
  remarks VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_purchase_order_no (legal_business_id, order_no),
  KEY idx_purchase_order_status (legal_business_id, division_id, status),
  KEY idx_purchase_order_supplier (legal_business_id, supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_purchase_order_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  line_amount DECIMAL(18,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_purchase_order_line (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
