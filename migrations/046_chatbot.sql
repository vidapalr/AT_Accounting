-- 046: WhatsApp chatbot (shop number): saved answers, chats that need a person, message log. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_bot_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  keywords VARCHAR(500) NOT NULL,
  reply VARCHAR(1500) NOT NULL,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bot_answers (legal_business_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acct_bot_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  wa_number VARCHAR(20) NOT NULL,
  contact_name VARCHAR(150) DEFAULT NULL,
  status ENUM('BOT','NEEDS_PERSON','DONE') NOT NULL DEFAULT 'BOT',
  awaiting ENUM('NONE','PRODUCT','ORDER') NOT NULL DEFAULT 'NONE',
  greeted_at DATETIME DEFAULT NULL,
  human_active_until DATETIME DEFAULT NULL,
  last_inbound_at DATETIME DEFAULT NULL,
  last_text VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_conv_number (legal_business_id, wa_number),
  KEY idx_bot_conv_status (legal_business_id, status, last_inbound_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acct_bot_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  direction ENUM('IN','OUT') NOT NULL,
  body VARCHAR(2000) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  wa_message_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_msg_wa (wa_message_id),
  KEY idx_bot_msg_conv (conversation_id, id),
  KEY idx_bot_msg_kind (legal_business_id, kind, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
