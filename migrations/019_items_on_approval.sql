-- 019: Items on approval (customer takes items home to try, no payment yet)
--
--   acct_approval_handouts   one hand-out (AP-0001): who took items, when they are due back
--   acct_approval_items      each item taken, and what happened to it
--                            (OUT = still with customer, KEPT = bought, RETURNED, DAMAGED)
--
-- Stock moves into a per-division "With customers" place (created by the app
-- the first time it is needed), so reports still add up. No accounting entry is
-- needed while the goods are out: the business still owns them.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_approval_handouts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NULL,
  from_location_id BIGINT UNSIGNED NOT NULL,
  holding_location_id BIGINT UNSIGNED NOT NULL,
  handout_no VARCHAR(60) NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  handed_date DATE NOT NULL,
  expected_back DATE NOT NULL,
  remarks VARCHAR(300) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_approval_handout_no (legal_business_id, handout_no),
  KEY idx_approval_handout_customer (legal_business_id, customer_id)
);

CREATE TABLE IF NOT EXISTS acct_approval_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  handout_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  total_cost DECIMAL(18,2) NOT NULL,
  status ENUM('OUT','KEPT','RETURNED','DAMAGED') NOT NULL DEFAULT 'OUT',
  closed_date DATE NULL,
  sale_id BIGINT UNSIGNED NULL,
  closed_by BIGINT UNSIGNED NULL,
  note VARCHAR(300) NULL,
  PRIMARY KEY (id),
  KEY idx_approval_item_handout (legal_business_id, handout_id),
  KEY idx_approval_item_status (legal_business_id, status),
  KEY idx_approval_item_customer (legal_business_id, customer_id)
);
