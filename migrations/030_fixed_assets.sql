-- 030: Fixed assets and depreciation
--
-- * acct_fixed_assets            one row per asset (shop fittings, machines, computers...)
-- * acct_asset_dep_runs          one row per month depreciation has been worked out for a division
-- * acct_asset_depreciation      each asset's share of a month's run
-- * accounts 1500 Fixed Assets (cost), 1510 Accumulated Depreciation (wear so far, reduces the
--   asset), 6100 Depreciation, 6110 Loss (gain) on disposal of assets
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS acct_fixed_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  asset_no VARCHAR(40) NOT NULL,
  asset_name VARCHAR(160) NOT NULL,
  category ENUM('FURNITURE_FITTINGS','MACHINERY','COMPUTERS','VEHICLE','OTHER') NOT NULL DEFAULT 'OTHER',
  purchase_date DATE NOT NULL,
  cost DECIMAL(18,2) NOT NULL,
  salvage_value DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  life_months INT UNSIGNED NOT NULL,
  paid_from ENUM('CASH','BANK','EARLIER') NOT NULL,
  bank_account_id BIGINT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NULL,
  remarks VARCHAR(500) NULL,
  status ENUM('ACTIVE','DISPOSED') NOT NULL DEFAULT 'ACTIVE',
  disposed_on DATE NULL,
  disposal_kind ENUM('SOLD','SCRAPPED','GIVEN_AWAY') NULL,
  proceeds DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  proceeds_bank_account_id BIGINT UNSIGNED NULL,
  proceeds_cash_account_id BIGINT UNSIGNED NULL,
  disposal_note VARCHAR(250) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fixed_asset_no (legal_business_id, asset_no),
  KEY idx_fixed_asset_status (legal_business_id, division_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_asset_dep_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  period CHAR(7) NOT NULL,
  total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_dep_run (legal_business_id, division_id, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acct_asset_depreciation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_id BIGINT UNSIGNED NOT NULL,
  asset_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_dep_once (run_id, asset_id),
  KEY idx_asset_dep_asset (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '1500', 'Fixed Assets (at cost)', 'ASSET', 'FIXED', 'DEBIT',
       1, 1, 0, 0, 'ACTIVE',
       'Shop fittings, machines, computers and other long-lasting things the business owns, at what they cost.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '1500');

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '1510', 'Accumulated Depreciation', 'ASSET', 'FIXED', 'CREDIT',
       1, 1, 0, 0, 'ACTIVE',
       'Wear charged so far on fixed assets. Taken off the cost to show what the assets are worth now.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '1510');

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '6100', 'Depreciation', 'EXPENSE', 'OPERATING', 'DEBIT',
       1, 1, 1, 0, 'ACTIVE',
       'The yearly wear on fixed assets, charged as an expense.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '6100');

INSERT INTO acct_chart_of_accounts (
  legal_business_id, account_code, account_name,
  account_type, account_subtype, normal_balance,
  is_posting_account, is_system_account,
  requires_division, requires_branch, status, description
)
SELECT b.id, '6110', 'Loss (Gain) on Disposal of Assets', 'EXPENSE', 'OPERATING', 'DEBIT',
       1, 1, 1, 0, 'ACTIVE',
       'What is lost (or gained, shown as a credit) when a fixed asset is sold for less (or more) than it is worth in the books.'
FROM acct_legal_businesses b
WHERE NOT EXISTS (SELECT 1 FROM acct_chart_of_accounts c WHERE c.legal_business_id = b.id AND c.account_code = '6110');
