-- 080: monthly budgets per branch (sales target and running-expense limit). Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_budgets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  month CHAR(7) NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  sales_target BIGINT NOT NULL DEFAULT 0,
  expense_limit BIGINT NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget (legal_business_id, month, branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
