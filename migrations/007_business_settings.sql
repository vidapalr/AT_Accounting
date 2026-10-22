-- 007: small key/value settings per business (owner's minimum group holding).
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_business_settings (
  legal_business_id BIGINT UNSIGNED NOT NULL,
  setting_key VARCHAR(80) NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (legal_business_id, setting_key),
  CONSTRAINT fk_business_settings_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The owner keeps at least 51% at Group level (so group-level investors total at most 49%).
INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT id, 'owner_min_group_percent', '51' FROM acct_legal_businesses;
