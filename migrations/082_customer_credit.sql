-- 082: customer credit (money a customer paid us beyond what they owed; we owe it back or use it on a later bill).
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_customer_credits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('RECEIVED','USED','REFUNDED') NOT NULL,
  entry_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  payment_method VARCHAR(20) NULL,
  bank_account_id BIGINT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  reference VARCHAR(150) NULL,
  source_sale_id BIGINT UNSIGNED NULL,
  applied_sale_id BIGINT UNSIGNED NULL,
  remarks VARCHAR(300) NULL,
  status ENUM('RECORDED','VOID') NOT NULL DEFAULT 'RECORDED',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_customer_credit (legal_business_id, customer_id, status),
  KEY idx_customer_credit_sale (applied_sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A bill can be paid with customer credit (used in the next delivery).
ALTER TABLE acct_sales_payments
  MODIFY payment_method ENUM('CASH','UPI','BANK_TRANSFER','CARD','OTHER','DISCOUNT','SET_OFF','EXCHANGE','CREDIT') NOT NULL;
