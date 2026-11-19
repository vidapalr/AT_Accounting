-- 095: Employee ID and contact details on staff records, for corporate offer and joining letters.
-- Staff record and the letters screen use these. Before it is run, letters show [Employee ID] and the
-- new boxes on the staff record are hidden.
-- Idempotent: safe to run more than once. No figures or posted entries change.

ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS employee_code VARCHAR(20) NULL AFTER id;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS home_address VARCHAR(300) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS department VARCHAR(100) NULL;
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS reports_to VARCHAR(150) NULL;

-- Give everyone already on the list an Employee ID (EMP-0001, EMP-0002 ... per company, oldest first).
UPDATE acct_employees e
  JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY legal_business_id ORDER BY id) AS rn
          FROM acct_employees) x ON x.id = e.id
   SET e.employee_code = CONCAT('EMP-', LPAD(x.rn, 4, '0'))
 WHERE e.employee_code IS NULL
   AND NOT EXISTS (SELECT 1 FROM (SELECT legal_business_id, employee_code FROM acct_employees) y
                    WHERE y.legal_business_id = e.legal_business_id AND y.employee_code IS NOT NULL);

ALTER TABLE acct_employees ADD UNIQUE KEY IF NOT EXISTS uq_employee_code (legal_business_id, employee_code);
