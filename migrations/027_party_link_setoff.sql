-- 027: A supplier who is also a customer (and the other way round), and setting one
-- amount off against the other.
--
-- * acct_suppliers.linked_customer_id / acct_customers.linked_supplier_id join the two
--   records of one person. Both records stay; no bill or payment is touched.
-- * A set-off cancels what they owe us against what we owe them, with no cash or bank.
--   It is stored as a payment with method SET_OFF on each side (so every "unpaid"
--   figure stays right) and one record in acct_party_setoffs that posts a single
--   journal: Payables down, Receivables down.
--
-- Idempotent: safe to run more than once.

ALTER TABLE acct_suppliers ADD COLUMN IF NOT EXISTS linked_customer_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_customers ADD COLUMN IF NOT EXISTS linked_supplier_id BIGINT UNSIGNED NULL;

ALTER TABLE acct_sales_payments
  MODIFY payment_method ENUM('CASH','UPI','BANK_TRANSFER','CARD','OTHER','DISCOUNT','SET_OFF') NOT NULL;
ALTER TABLE acct_purchase_payments
  MODIFY payment_method ENUM('BANK_TRANSFER','UPI','CASH','CHEQUE','OTHER','SET_OFF') NOT NULL;

CREATE TABLE IF NOT EXISTS acct_party_setoffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  setoff_no VARCHAR(40) NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  setoff_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  note VARCHAR(250) NULL,
  status ENUM('RECORDED') NOT NULL DEFAULT 'RECORDED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_party_setoff_no (legal_business_id, setoff_no),
  KEY idx_party_setoff_supplier (legal_business_id, supplier_id),
  KEY idx_party_setoff_customer (legal_business_id, customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_party_setoff_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  setoff_id BIGINT UNSIGNED NOT NULL,
  side ENUM('SALE','PURCHASE') NOT NULL,
  doc_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_party_setoff_line (setoff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
