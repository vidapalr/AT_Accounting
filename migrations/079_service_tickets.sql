-- 079: customer service tickets (complaints, exchange requests, alterations) with a history. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_service_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  ticket_no VARCHAR(20) NOT NULL,
  kind VARCHAR(12) NOT NULL DEFAULT 'COMPLAINT',
  status VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  customer_id BIGINT UNSIGNED NULL,
  contact_name VARCHAR(160) NOT NULL,
  contact_phone CHAR(10) NULL,
  sale_id BIGINT UNSIGNED NULL,
  summary VARCHAR(200) NOT NULL,
  details VARCHAR(1000) NULL,
  follow_up_on DATE NULL,
  resolution VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  UNIQUE KEY uq_ticket_no (legal_business_id, ticket_no),
  KEY idx_ticket_status (legal_business_id, status, follow_up_on),
  KEY idx_ticket_customer (legal_business_id, customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_service_ticket_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  ticket_id BIGINT UNSIGNED NOT NULL,
  status_after VARCHAR(10) NOT NULL,
  note VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ticket_log (legal_business_id, ticket_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
