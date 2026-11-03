-- Sales pipeline for bigger or wholesale deals. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_deals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  party_name VARCHAR(160) NOT NULL,
  phone CHAR(10) NULL,
  customer_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  expected_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  stage ENUM('ENQUIRY','QUOTED','NEGOTIATING','WON','LOST') NOT NULL DEFAULT 'ENQUIRY',
  expected_close DATE NULL,
  note VARCHAR(500) NULL,
  lost_reason VARCHAR(200) NULL,
  closed_on DATE NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_deals_stage (legal_business_id, stage, expected_close)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
