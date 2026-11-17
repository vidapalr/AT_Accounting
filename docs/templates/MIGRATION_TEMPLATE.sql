-- NNN: <one line: what this adds and why, in plain words>
-- <Which screen uses it. What happens before it is run (feature hidden / standard behaviour).>
-- Idempotent: safe to run more than once. <Say whether any figures or posted entries change.>

CREATE TABLE IF NOT EXISTS acct_<name> (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,          -- every table belongs to one company
  -- division_id / branch_id when the record belongs to a place
  -- columns ...
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_<name>_business (legal_business_id, status),
  CONSTRAINT fk_<name>_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adding a column to an existing table:
-- ALTER TABLE acct_<table> ADD COLUMN IF NOT EXISTS <column> <type> NULL;

-- Unique keys always include legal_business_id, so two companies can use the same numbers:
-- ALTER TABLE acct_<table> ADD UNIQUE KEY IF NOT EXISTS uq_<name> (legal_business_id, <column>);

-- Seed rows for every existing company (never for one fixed id):
-- INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
-- SELECT id, '<key>', '<default>' FROM acct_legal_businesses;
