-- 045: lets the morning digest be chosen as a WhatsApp report. Safe to run twice.
ALTER TABLE acct_whatsapp_subscriptions
  MODIFY COLUMN report_type ENUM('DAILY_SALES','DAILY_FULL','STOCK_DAILY','STOCK_MONTHLY','ALERTS','MORNING_DIGEST','INVESTOR_STATEMENT') NOT NULL;
