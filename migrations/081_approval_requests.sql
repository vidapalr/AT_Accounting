-- 081: approval requests (an entry above a limit waits for a check and a final approval). Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_approval_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(30) NOT NULL,
  amount BIGINT NOT NULL,
  summary VARCHAR(300) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  requested_role VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL,
  checked_by BIGINT UNSIGNED NULL,
  checked_at DATETIME NULL,
  final_by BIGINT UNSIGNED NULL,
  final_at DATETIME NULL,
  reject_reason VARCHAR(300) NULL,
  result_note VARCHAR(300) NULL,
  result_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_approval_status (legal_business_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
