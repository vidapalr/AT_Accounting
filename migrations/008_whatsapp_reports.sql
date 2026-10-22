-- 008: WhatsApp report recipients, what each receives, and a log of every message.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_whatsapp_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  phone_e164 VARCHAR(16) NOT NULL,
  -- Set for an investor, so the monthly statement covers only that investor's agreements.
  investor_party_id BIGINT UNSIGNED DEFAULT NULL,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  notes VARCHAR(300) DEFAULT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_whatsapp_phone (legal_business_id, phone_e164),
  CONSTRAINT fk_wa_recipient_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id),
  CONSTRAINT fk_wa_recipient_user FOREIGN KEY (created_by) REFERENCES acct_app_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acct_whatsapp_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  report_type ENUM('DAILY_SALES','DAILY_FULL','STOCK_DAILY','STOCK_MONTHLY','ALERTS','INVESTOR_STATEMENT') NOT NULL,
  -- Both empty = whole group; division only = that division; branch = that branch.
  division_id BIGINT UNSIGNED DEFAULT NULL,
  branch_id BIGINT UNSIGNED DEFAULT NULL,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wa_sub_recipient (recipient_id),
  CONSTRAINT fk_wa_sub_recipient FOREIGN KEY (recipient_id) REFERENCES acct_whatsapp_recipients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acct_whatsapp_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  report_type VARCHAR(30) NOT NULL,
  -- '2026-10-22' for daily reports, '2026-10' for monthly ones. One message per subscription per period.
  period_key VARCHAR(40) NOT NULL,
  status ENUM('PENDING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(120) DEFAULT NULL,
  error_text VARCHAR(500) DEFAULT NULL,
  headline_json LONGTEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wa_outbox_period (subscription_id, period_key),
  KEY idx_wa_outbox_created (legal_business_id, created_at),
  CONSTRAINT fk_wa_outbox_sub FOREIGN KEY (subscription_id) REFERENCES acct_whatsapp_subscriptions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Low-stock level: an item is "low" when this many units or fewer remain.
INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT id, 'low_stock_units', '5' FROM acct_legal_businesses;
