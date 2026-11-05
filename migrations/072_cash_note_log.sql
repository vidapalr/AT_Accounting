-- 072: remember which notes came in and which went back as change on each cash sale,
-- so closing the day can show how many notes of each kind should be in the drawer.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_cash_note_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  cash_account_id BIGINT UNSIGNED NOT NULL,
  sale_id BIGINT UNSIGNED NULL,
  moved_on DATE NOT NULL,
  received_json TEXT NULL,
  change_json TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cash_note_log (legal_business_id, cash_account_id, moved_on),
  KEY idx_cash_note_sale (sale_id)
);
