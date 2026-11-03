-- People who asked or enquired but have not bought yet. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  phone CHAR(10) NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  interest VARCHAR(300) NULL,
  status ENUM('NEW','FOLLOW_UP','WON','LOST') NOT NULL DEFAULT 'NEW',
  follow_up_on DATE NULL,
  note VARCHAR(500) NULL,
  customer_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_leads_status (legal_business_id, status, follow_up_on),
  KEY idx_leads_phone (legal_business_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
