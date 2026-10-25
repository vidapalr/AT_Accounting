-- 024: A view-only login for the auditor
-- Adds AUDITOR to the list of access levels. Run once.

ALTER TABLE acct_user_access
  MODIFY role ENUM('GROUP_OWNER','ACCOUNTANT','DIVISION_MANAGER','CASHIER','INVESTOR','LENDER','AUDITOR') NOT NULL;
