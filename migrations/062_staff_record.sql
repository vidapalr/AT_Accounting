-- 062: Staff record (item 2.6)
-- Dates of notice and leaving on each person, and every salary change kept with its date.
-- Idempotent: safe to run more than once.

ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS notice_given_on DATE NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS left_on DATE NULL;

CREATE TABLE IF NOT EXISTS acct_employee_pay_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  monthly_salary DECIMAL(18,2) NOT NULL,
  note VARCHAR(200) NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pay_history (legal_business_id, employee_id, effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Start each existing person's history with today's salary, from the day they joined.
INSERT INTO acct_employee_pay_history (legal_business_id, employee_id, effective_from, monthly_salary, note, changed_by)
SELECT e.legal_business_id, e.id, COALESCE(e.joined_on, DATE(e.created_at)), e.monthly_salary, 'Starting salary', e.created_by
  FROM acct_employees e
 WHERE NOT EXISTS (SELECT 1 FROM acct_employee_pay_history h WHERE h.employee_id = e.id);
