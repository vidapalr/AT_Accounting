-- 010: customer master. The phone number is the key. Safe to run more than once.
-- Existing invoices are linked to customers (duplicates are merged by phone number).
-- Invoices with no usable phone number but a real name become name-only customers
-- so you can add their phone later. "Walk-in" bills stay without a customer.

CREATE TABLE IF NOT EXISTS acct_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_code VARCHAR(30) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  -- 10 digit mobile number, no country code. Empty only for old name-only records.
  phone VARCHAR(15) DEFAULT NULL,
  customer_type ENUM('RETAIL','WHOLESALE') NOT NULL DEFAULT 'RETAIL',
  address VARCHAR(300) DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  -- Ready for wholesale GST invoices; not used yet.
  gstin VARCHAR(15) DEFAULT NULL,
  -- 0 means no limit.
  credit_limit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  whatsapp_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(500) DEFAULT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_code (legal_business_id, customer_code),
  UNIQUE KEY uq_customer_phone (legal_business_id, phone),
  KEY idx_customer_name (legal_business_id, full_name),
  CONSTRAINT fk_customer_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE acct_sales_headers
  ADD COLUMN IF NOT EXISTS customer_id BIGINT UNSIGNED DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_customer ON acct_sales_headers (legal_business_id, customer_id);

-- Last 10 digits of the phone, only when it looks like an Indian mobile number.
DROP TEMPORARY TABLE IF EXISTS tmp_sale_phone;
CREATE TEMPORARY TABLE tmp_sale_phone AS
SELECT s.id AS sale_id, s.legal_business_id, s.invoice_date, s.customer_name,
       CASE
         WHEN LENGTH(REGEXP_REPLACE(IFNULL(s.customer_phone, ''), '[^0-9]', '')) >= 10
          AND RIGHT(REGEXP_REPLACE(s.customer_phone, '[^0-9]', ''), 10) REGEXP '^[6-9][0-9]{9}$'
         THEN RIGHT(REGEXP_REPLACE(s.customer_phone, '[^0-9]', ''), 10)
         ELSE NULL
       END AS phone10
FROM acct_sales_headers s
WHERE s.customer_id IS NULL AND s.status <> 'VOID';

-- 1. Customers that have a phone number: one per phone, named from the latest invoice.
SET @n := (SELECT IFNULL(MAX(CAST(SUBSTRING(customer_code, 5) AS UNSIGNED)), 0)
           FROM acct_customers WHERE customer_code REGEXP '^CUS-[0-9]+$');

INSERT INTO acct_customers (legal_business_id, customer_code, full_name, phone)
SELECT t.legal_business_id,
       CONCAT('CUS-', LPAD(@n := @n + 1, 4, '0')),
       IFNULL((SELECT t2.customer_name FROM tmp_sale_phone t2
               WHERE t2.legal_business_id = t.legal_business_id AND t2.phone10 COLLATE utf8mb4_general_ci = t.phone10 COLLATE utf8mb4_general_ci
                 AND t2.customer_name IS NOT NULL AND TRIM(t2.customer_name) <> ''
               ORDER BY t2.invoice_date DESC, t2.sale_id DESC LIMIT 1),
              CONCAT('Customer ', t.phone10)),
       t.phone10
FROM (SELECT DISTINCT legal_business_id, phone10 FROM tmp_sale_phone WHERE phone10 IS NOT NULL) t
WHERE NOT EXISTS (SELECT 1 FROM acct_customers c
                  WHERE c.legal_business_id = t.legal_business_id AND c.phone COLLATE utf8mb4_general_ci = t.phone10 COLLATE utf8mb4_general_ci);

-- 2. Real names with no usable phone: one name-only customer per name.
INSERT INTO acct_customers (legal_business_id, customer_code, full_name, phone, notes)
SELECT t.legal_business_id,
       CONCAT('CUS-', LPAD(@n := @n + 1, 4, '0')),
       t.nm, NULL, 'Added from old invoices. Please add the phone number.'
FROM (SELECT legal_business_id, MIN(TRIM(customer_name)) AS nm
      FROM tmp_sale_phone
      WHERE phone10 IS NULL AND customer_name IS NOT NULL AND TRIM(customer_name) <> ''
        AND LOWER(REPLACE(TRIM(customer_name), '-', '')) NOT IN ('walkin', 'walk in', 'walk-in', 'walk in customer', 'cash', 'customer')
      GROUP BY legal_business_id, LOWER(TRIM(customer_name)) COLLATE utf8mb4_general_ci) t
WHERE NOT EXISTS (SELECT 1 FROM acct_customers c
                  WHERE c.legal_business_id = t.legal_business_id AND c.phone IS NULL
                    AND LOWER(c.full_name) COLLATE utf8mb4_general_ci = LOWER(t.nm) COLLATE utf8mb4_general_ci);

-- 3. Link the invoices.
UPDATE acct_sales_headers s
JOIN tmp_sale_phone t ON t.sale_id = s.id
JOIN acct_customers c ON c.legal_business_id = s.legal_business_id AND c.phone COLLATE utf8mb4_general_ci = t.phone10 COLLATE utf8mb4_general_ci
SET s.customer_id = c.id
WHERE t.phone10 IS NOT NULL AND s.customer_id IS NULL;

UPDATE acct_sales_headers s
JOIN tmp_sale_phone t ON t.sale_id = s.id
JOIN acct_customers c ON c.legal_business_id = s.legal_business_id
                     AND c.phone IS NULL AND LOWER(c.full_name) COLLATE utf8mb4_general_ci = LOWER(TRIM(s.customer_name)) COLLATE utf8mb4_general_ci
SET s.customer_id = c.id
WHERE t.phone10 IS NULL AND s.customer_id IS NULL;

DROP TEMPORARY TABLE IF EXISTS tmp_sale_phone;
