-- 063: Points and coupons (owner's rules, 3 Nov 2026)
-- Points are worked out from the bills themselves (retail customers, 1 point per Rs 200),
-- so only what a bill USED needs to be stored. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  kind ENUM('PERCENT','RUPEES') NOT NULL,
  value DECIMAL(18,2) NOT NULL,
  min_bill DECIMAL(18,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(18,2) NULL,
  starts_on DATE NULL,
  ends_on DATE NULL,
  once_per_customer TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_code (legal_business_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_sale_rewards (
  sale_id BIGINT UNSIGNED NOT NULL,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  points_used INT UNSIGNED NOT NULL DEFAULT 0,
  points_discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  coupon_id BIGINT UNSIGNED NULL,
  coupon_discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sale_id),
  KEY idx_reward_customer (legal_business_id, customer_id),
  KEY idx_reward_coupon (legal_business_id, coupon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
