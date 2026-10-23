-- 013: stock reports sent by employees on WhatsApp (or pasted in). Each message
-- becomes a DRAFT that the owner or accountant approves. Nothing changes stock by itself.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_stock_reporters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  -- 10 digit mobile number the employee messages from.
  phone VARCHAR(15) NOT NULL,
  -- The shop or warehouse this person reports for.
  location_id BIGINT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reporter_phone (legal_business_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS acct_stock_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED DEFAULT NULL,
  source ENUM('WHATSAPP','PASTED') NOT NULL,
  -- WhatsApp's own id for the message, so a retry never makes a second draft.
  wa_message_id VARCHAR(120) DEFAULT NULL,
  reporter_id BIGINT UNSIGNED DEFAULT NULL,
  reporter_name VARCHAR(150) DEFAULT NULL,
  location_id BIGINT UNSIGNED DEFAULT NULL,
  raw_line VARCHAR(500) NOT NULL,
  action ENUM('RECEIVED','DAMAGED','LOST','COUNT','SOLD') DEFAULT NULL,
  variant_id BIGINT UNSIGNED DEFAULT NULL,
  quantity DECIMAL(18,3) DEFAULT NULL,
  price DECIMAL(18,2) DEFAULT NULL,
  note VARCHAR(300) DEFAULT NULL,
  -- Set when the line could not be understood; shown to the approver.
  problem VARCHAR(300) DEFAULT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','DONE') NOT NULL DEFAULT 'PENDING',
  decided_by BIGINT UNSIGNED DEFAULT NULL,
  decided_at DATETIME DEFAULT NULL,
  result_note VARCHAR(300) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_draft_wa (legal_business_id, wa_message_id, raw_line(100)),
  KEY idx_stock_draft_status (legal_business_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
