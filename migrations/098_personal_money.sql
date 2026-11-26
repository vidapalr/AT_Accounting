-- 098: The owner's personal money (seen only by the owner who records it).
-- Owner accounts become personal accounts: bank, credit card, cash or wallet, with bank name,
-- last 4 digits, card limit, bill day, due day and opening balance. Money already linked to the
-- business (money put in or taken out, business bills paid from your account, cash taken home)
-- shows on these accounts by itself. Plus personal entries (income, expenses, transfers),
-- loans given or taken with EMIs, and investments.
-- Used by Accounting > My money. Before it is run, those screens say this file is needed.
-- Idempotent: safe to run more than once. No business figures change.

ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS owner_user_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS kind ENUM('BANK','CREDIT_CARD','CASH','WALLET') NOT NULL DEFAULT 'BANK';
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120) NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS last4 CHAR(4) NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(14,2) NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS bill_day TINYINT UNSIGNED NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS due_day TINYINT UNSIGNED NULL;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE acct_owner_accounts ADD COLUMN IF NOT EXISTS opening_date DATE NULL;

CREATE TABLE IF NOT EXISTS acct_personal_loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  direction ENUM('GIVEN','TAKEN') NOT NULL,          -- GIVEN: you lent it; TAKEN: you borrowed it
  party_name VARCHAR(150) NOT NULL,                   -- the person, bank or lender
  start_date DATE NOT NULL,
  opening_outstanding DECIMAL(14,2) NOT NULL DEFAULT 0, -- still owed when it was added (an older loan)
  interest_rate DECIMAL(6,2) NULL,                    -- % a year
  emi_amount DECIMAL(14,2) NULL,
  emi_day TINYINT UNSIGNED NULL,
  end_date DATE NULL,
  note VARCHAR(300) NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_loans_owner (legal_business_id, owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acct_personal_investments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('FD','RD','GOLD','SHARES','MUTUAL_FUND','CHIT','PROPERTY','INSURANCE','OTHER') NOT NULL,
  name VARCHAR(150) NOT NULL,
  opening_invested DECIMAL(14,2) NOT NULL DEFAULT 0,  -- already put in before it was added here
  current_value DECIMAL(14,2) NULL,
  value_on DATE NULL,
  maturity_date DATE NULL,
  note VARCHAR(300) NULL,
  status ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_investments_owner (legal_business_id, owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS acct_personal_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  entry_date DATE NOT NULL,
  kind ENUM('INCOME','EXPENSE','TRANSFER','LOAN_GIVEN','LOAN_TAKEN','LOAN_RECEIVED','LOAN_PAID','INVEST','REDEEM') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  interest_amount DECIMAL(14,2) NOT NULL DEFAULT 0, -- loan repayments: the part that is interest
  account_id BIGINT UNSIGNED NULL,                    -- your account the money left or entered
  to_account_id BIGINT UNSIGNED NULL,                 -- transfers and card bill payments
  category VARCHAR(60) NULL,
  loan_id BIGINT UNSIGNED NULL,
  investment_id BIGINT UNSIGNED NULL,
  note VARCHAR(300) NULL,
  status ENUM('RECORDED','VOID') NOT NULL DEFAULT 'RECORDED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_entries_owner (legal_business_id, owner_user_id, entry_date),
  KEY idx_personal_entries_account (account_id),
  KEY idx_personal_entries_loan (loan_id),
  KEY idx_personal_entries_investment (investment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
