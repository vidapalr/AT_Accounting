-- 094: IN or OUT sent from a number that no staff record has.
-- Screens: Staff > Attendance register ("IN or OUT from a number nobody has").
-- Why: before this, such a message went quietly to the shop chatbot and nothing showed anywhere,
-- so there was no way to see that a person's WhatsApp number was missing or typed wrongly.
-- Idempotent: safe to run more than once. No existing figures change.

CREATE TABLE IF NOT EXISTS acct_attendance_unmatched (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  /** Last 10 digits of the number the message came from. */
  phone VARCHAR(15) NOT NULL,
  word ENUM('IN','OUT') NOT NULL,
  /** India date and time of the message. */
  work_date DATE NOT NULL,
  at_time TIME NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attendance_unmatched (legal_business_id, work_date, phone),
  CONSTRAINT fk_attendance_unmatched_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
