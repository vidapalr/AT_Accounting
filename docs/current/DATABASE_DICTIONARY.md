# Database dictionary and DDL history

Source-derived: base schema (through migration 040), followed by migrations 041–078. These are exact CREATE/ALTER definitions, not a database introspection or a flattened final schema. Read later ALTER statements to determine a column’s latest type/default and indexes. DML backfills, triggers and seed records remain in the linked SQL sources. No migrations were executed. The base dump identifies MariaDB 11.8.9; MySQL compatibility must not be assumed.

Tables with CREATE definitions: **136**. Explicit foreign-key declarations extracted: **174**.

## acct_accounting_periods

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 30)

```sql
CREATE TABLE `acct_accounting_periods` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `fiscal_year_label` varchar(9) NOT NULL,
  `period_no` tinyint(3) UNSIGNED NOT NULL,
  `period_name` varchar(30) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('NOT_OPENED','OPEN','SOFT_CLOSED','CLOSED') NOT NULL DEFAULT 'NOT_OPENED',
  `opened_by` bigint(20) UNSIGNED DEFAULT NULL,
  `opened_at` datetime DEFAULT NULL,
  `soft_closed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `soft_closed_at` datetime DEFAULT NULL,
  `closed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `status_reason` varchar(1000) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_accounting_periods`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_period_business_year_no` (`legal_business_id`,`fiscal_year_label`,`period_no`),
  ADD UNIQUE KEY `uq_period_business_dates` (`legal_business_id`,`start_date`,`end_date`),
  ADD UNIQUE KEY `uq_acct_period_business_id` (`legal_business_id`,`id`),
  ADD KEY `idx_period_business_date` (`legal_business_id`,`start_date`,`end_date`,`status`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_accounting_periods`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_advance_transactions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 80)

```sql
CREATE TABLE `acct_advance_transactions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `advance_id` bigint(20) UNSIGNED NOT NULL,
  `transaction_date` date NOT NULL,
  `transaction_type` enum('ADVANCE_PAID','REFUND_RECEIVED','EXPENSE_ADJUSTMENT','SUPPLIER_ADJUSTMENT','OTHER_ADJUSTMENT') NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` enum('CASH','UPI','BANK_TRANSFER','CARD','CHEQUE','OTHER') DEFAULT NULL,
  `payment_source` enum('BUSINESS_BANK','BUSINESS_CASH','INVESTOR_BANK','INVESTOR_CASH','OWNER_PERSONAL') DEFAULT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `funding_party_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payment_reference` varchar(150) DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `status` enum('DRAFT','CONFIRMED','VOID') NOT NULL DEFAULT 'DRAFT',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_advance_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_advance_transactions` (`legal_business_id`,`advance_id`,`transaction_date`),
  ADD KEY `fk_advance_tx_bank` (`bank_account_id`),
  ADD KEY `fk_advance_tx_cash` (`cash_account_id`),
  ADD KEY `fk_advance_tx_funding` (`legal_business_id`,`funding_party_id`),
  ADD KEY `fk_advance_tx_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_advance_transactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_advance_transactions`
  ADD CONSTRAINT `fk_advance_tx_advance` FOREIGN KEY (`legal_business_id`,`advance_id`) REFERENCES `acct_advances` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_advance_tx_bank` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_advance_tx_cash` FOREIGN KEY (`cash_account_id`) REFERENCES `acct_cash_accounts` (`id`),
  ADD CONSTRAINT `fk_advance_tx_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_advance_tx_funding` FOREIGN KEY (`legal_business_id`,`funding_party_id`) REFERENCES `acct_funding_parties` (`legal_business_id`, `id`);
```

## acct_advances

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 57)

```sql
CREATE TABLE `acct_advances` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `advance_no` varchar(60) NOT NULL,
  `advance_type` enum('REFUNDABLE_SHOP_DEPOSIT','SUPPLIER_ADVANCE','EMPLOYEE_ADVANCE','PREPAID_RENT','OTHER') NOT NULL,
  `advance_date` date NOT NULL,
  `recipient_name` varchar(180) NOT NULL,
  `description` varchar(500) NOT NULL,
  `original_amount` decimal(18,2) NOT NULL,
  `status` enum('DRAFT','ACTIVE','SETTLED','VOID') NOT NULL DEFAULT 'DRAFT',
  `remarks` varchar(500) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_advances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_advance_no` (`legal_business_id`,`advance_no`),
  ADD UNIQUE KEY `uq_advance_business_id` (`legal_business_id`,`id`),
  ADD KEY `fk_advance_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_advance_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_advances`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_advances`
  ADD CONSTRAINT `fk_advance_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_advance_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_advance_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_agreement_amendments

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 105)

```sql
CREATE TABLE `acct_agreement_amendments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED NOT NULL,
  `from_version_id` bigint(20) UNSIGNED DEFAULT NULL,
  `to_version_id` bigint(20) UNSIGNED NOT NULL,
  `amendment_reason` text NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `requested_by` bigint(20) UNSIGNED NOT NULL,
  `requested_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `reviewed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_amendments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_amendment_target_version` (`to_version_id`),
  ADD KEY `fk_amend_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_amend_from` (`from_version_id`),
  ADD KEY `fk_amend_requester` (`requested_by`),
  ADD KEY `fk_amend_reviewer` (`reviewed_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_amendments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_amendments`
  ADD CONSTRAINT `fk_amend_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_amend_from` FOREIGN KEY (`from_version_id`) REFERENCES `acct_agreement_versions` (`id`),
  ADD CONSTRAINT `fk_amend_requester` FOREIGN KEY (`requested_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_amend_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_amend_to` FOREIGN KEY (`to_version_id`) REFERENCES `acct_agreement_versions` (`id`);
```

## acct_agreement_funding_policies

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 126)

```sql
CREATE TABLE `acct_agreement_funding_policies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_version_id` bigint(20) UNSIGNED NOT NULL,
  `policy_status` enum('DRAFT','CONFIRMED') NOT NULL DEFAULT 'DRAFT',
  `funding_model` enum('FIXED','FLEXIBLE_ADVANCE','REVOLVING','TERM_LOAN','NO_INITIAL_FUNDING') NOT NULL,
  `maximum_outstanding` decimal(18,2) DEFAULT NULL,
  `minimum_funding` decimal(18,2) DEFAULT NULL,
  `additional_funding_allowed` tinyint(1) NOT NULL DEFAULT 0,
  `flexible_repayment_allowed` tinyint(1) NOT NULL DEFAULT 0,
  `profit_entitlement_model` enum('NOT_APPLICABLE','FIXED_CONTRACTUAL','OUTSTANDING_DEPENDENT','TIME_WEIGHTED','MINIMUM_FUNDING') NOT NULL,
  `entitlement_on_zero_balance` tinyint(1) DEFAULT NULL,
  `loss_sharing_model` enum('UNSPECIFIED','NONE','SAME_AS_PROFIT','CUSTOM_PERCENTAGE','CAPPED') NOT NULL DEFAULT 'UNSPECIFIED',
  `loss_share_percentage` decimal(7,4) DEFAULT NULL,
  `maximum_loss_exposure` decimal(18,2) DEFAULT NULL,
  `loss_settlement_method` enum('UNSPECIFIED','NOT_APPLICABLE','CARRY_FORWARD','DEDUCT_FROM_RISK_BALANCE','ADDITIONAL_CONTRIBUTION') NOT NULL DEFAULT 'UNSPECIFIED',
  `profit_calculation_order` enum('UNSPECIFIED','BEFORE_OTHER_ALLOCATIONS','AFTER_BRANCH_ALLOCATIONS','CONTRACT_DEFINED') NOT NULL DEFAULT 'UNSPECIFIED',
  `policy_notes` text DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_funding_policies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_policy_agreement_version` (`agreement_version_id`),
  ADD KEY `fk_policy_creator` (`created_by`),
  ADD KEY `idx_policy_business_agreement` (`legal_business_id`,`agreement_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_funding_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_funding_policies`
  ADD CONSTRAINT `fk_policy_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_policy_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_policy_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`);
```

## acct_agreement_versions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 155)

```sql
CREATE TABLE `acct_agreement_versions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED NOT NULL,
  `version_no` int(10) UNSIGNED NOT NULL,
  `version_status` enum('DRAFT','APPROVED','SUPERSEDED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `terms_json` longtext NOT NULL,
  `change_reason` varchar(1000) NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_versions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_agreement_version` (`agreement_id`,`version_no`),
  ADD KEY `fk_version_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_version_creator` (`created_by`),
  ADD KEY `fk_version_approver` (`approved_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_versions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_agreement_versions`
  ADD CONSTRAINT `fk_version_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_version_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_version_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_amendment_evidence_reviews

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 177)

```sql
CREATE TABLE `acct_amendment_evidence_reviews` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED NOT NULL,
  `amendment_id` bigint(20) UNSIGNED NOT NULL,
  `proposed_version_id` bigint(20) UNSIGNED NOT NULL,
  `signed_document_id` bigint(20) UNSIGNED NOT NULL,
  `reviewed_document_sha256` char(64) NOT NULL,
  `investor_consent_verified` tinyint(1) NOT NULL DEFAULT 0,
  `document_verified` tinyint(1) NOT NULL DEFAULT 0,
  `review_notes` text DEFAULT NULL,
  `reviewed_by` bigint(20) UNSIGNED NOT NULL,
  `reviewed_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_amendment_evidence_reviews`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_amendment_evidence_review` (`amendment_id`),
  ADD KEY `idx_amendment_evidence_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `idx_amendment_evidence_document` (`signed_document_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_amendment_evidence_reviews`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_app_users

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 242)

```sql
CREATE TABLE `acct_app_users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `full_name` varchar(160) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `status` enum('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_app_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_app_users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_approval_handouts

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 198)

```sql
CREATE TABLE `acct_approval_handouts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `from_location_id` bigint(20) UNSIGNED NOT NULL,
  `holding_location_id` bigint(20) UNSIGNED NOT NULL,
  `handout_no` varchar(60) NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `handed_date` date NOT NULL,
  `expected_back` date NOT NULL,
  `remarks` varchar(300) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_approval_handouts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_approval_handout_no` (`legal_business_id`,`handout_no`),
  ADD KEY `idx_approval_handout_customer` (`legal_business_id`,`customer_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_approval_handouts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_approval_items

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 220)

```sql
CREATE TABLE `acct_approval_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `handout_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `total_cost` decimal(18,2) NOT NULL,
  `status` enum('OUT','KEPT','RETURNED','DAMAGED') NOT NULL DEFAULT 'OUT',
  `closed_date` date DEFAULT NULL,
  `sale_id` bigint(20) UNSIGNED DEFAULT NULL,
  `closed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `note` varchar(300) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_approval_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_approval_item_handout` (`legal_business_id`,`handout_id`),
  ADD KEY `idx_approval_item_status` (`legal_business_id`,`status`),
  ADD KEY `idx_approval_item_customer` (`legal_business_id`,`customer_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_approval_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_asset_dep_runs

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 270)

```sql
CREATE TABLE `acct_asset_dep_runs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `period` char(7) NOT NULL,
  `total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_asset_dep_runs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_asset_dep_run` (`legal_business_id`,`division_id`,`period`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_asset_dep_runs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_asset_depreciation

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 257)

```sql
CREATE TABLE `acct_asset_depreciation` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `run_id` bigint(20) UNSIGNED NOT NULL,
  `asset_id` bigint(20) UNSIGNED NOT NULL,
  `amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_asset_depreciation`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_asset_dep_once` (`run_id`,`asset_id`),
  ADD KEY `idx_asset_dep_asset` (`asset_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_asset_depreciation`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_audit_events

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 302)

```sql
CREATE TABLE `acct_audit_events` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `actor_user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `action` varchar(80) NOT NULL,
  `subject_type` varchar(80) NOT NULL,
  `subject_id` bigint(20) UNSIGNED NOT NULL,
  `details_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details_json`)),
  `occurred_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_audit_events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_audit_subject` (`subject_type`,`subject_id`),
  ADD KEY `legal_business_id` (`legal_business_id`),
  ADD KEY `actor_user_id` (`actor_user_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_audit_events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_audit_events`
  ADD CONSTRAINT `acct_audit_events_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_audit_events_ibfk_2` FOREIGN KEY (`actor_user_id`) REFERENCES `acct_app_users` (`id`);
```

## acct_auditor_adjustments

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 286)

```sql
CREATE TABLE `acct_auditor_adjustments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `adjustment_no` varchar(60) NOT NULL,
  `entry_date` date NOT NULL,
  `reason` varchar(300) NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_auditor_adjustments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_auditor_adjustment_no` (`legal_business_id`,`adjustment_no`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_auditor_adjustments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_bank_accounts

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 319)

```sql
CREATE TABLE `acct_bank_accounts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `ownership_type` enum('BUSINESS','INVESTOR') NOT NULL,
  `funding_party_id` bigint(20) UNSIGNED DEFAULT NULL,
  `account_label` varchar(120) NOT NULL,
  `account_holder_name` varchar(160) NOT NULL,
  `bank_name` varchar(160) NOT NULL,
  `branch_name` varchar(160) DEFAULT NULL,
  `ifsc_code` varchar(11) NOT NULL,
  `account_type` enum('CURRENT','SAVINGS','OD_CC','OTHER') NOT NULL,
  `account_number_encrypted` text NOT NULL,
  `account_number_iv` varchar(32) NOT NULL,
  `account_number_auth_tag` varchar(32) NOT NULL,
  `account_number_last4` char(4) NOT NULL,
  `account_number_fingerprint` char(64) NOT NULL,
  `can_receive` tinyint(1) NOT NULL DEFAULT 1,
  `can_send` tinyint(1) NOT NULL DEFAULT 1,
  `gl_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `verification_status` enum('UNVERIFIED','VERIFIED') NOT NULL DEFAULT 'UNVERIFIED',
  `notes` text DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `verification_id` bigint(20) UNSIGNED DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `verified_by` bigint(20) UNSIGNED DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bank_account_fingerprint` (`legal_business_id`,`account_number_fingerprint`),
  ADD UNIQUE KEY `uq_bank_business_gl` (`legal_business_id`,`gl_account_id`),
  ADD KEY `idx_bank_owner` (`legal_business_id`,`ownership_type`,`funding_party_id`),
  ADD KEY `idx_bank_status` (`legal_business_id`,`status`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_accounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_accounts`
  ADD CONSTRAINT `fk_bank_account_gl` FOREIGN KEY (`legal_business_id`,`gl_account_id`) REFERENCES `acct_chart_of_accounts` (`legal_business_id`, `id`);
```

## acct_bank_evidence

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 355)

```sql
CREATE TABLE `acct_bank_evidence` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED NOT NULL,
  `original_filename` varchar(200) NOT NULL,
  `storage_key` varchar(255) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `file_size` bigint(20) UNSIGNED NOT NULL,
  `sha256` char(64) NOT NULL,
  `uploaded_by` bigint(20) UNSIGNED NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT current_timestamp(),
  `status` enum('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_evidence`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bank_evidence_storage` (`storage_key`),
  ADD KEY `idx_bank_evidence_account` (`legal_business_id`,`bank_account_id`),
  ADD KEY `fk_bank_evidence_account` (`bank_account_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_evidence`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_evidence`
  ADD CONSTRAINT `fk_bank_evidence_account` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`);
```

## acct_bank_statement_lines

Definition: [migrations/061_bank_statements.sql](../../migrations/061_bank_statements.sql) (line 5)

```sql
CREATE TABLE IF NOT EXISTS acct_bank_statement_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  bank_account_id BIGINT UNSIGNED NOT NULL,
  line_date DATE NOT NULL,
  description VARCHAR(500) NOT NULL,
  money_out DECIMAL(18,2) NOT NULL DEFAULT 0,
  money_in DECIMAL(18,2) NOT NULL DEFAULT 0,
  balance DECIMAL(18,2) NULL,
  line_hash CHAR(40) NOT NULL,
  journal_line_id BIGINT UNSIGNED NULL,
  status ENUM('UNMATCHED','MATCHED','IGNORED') NOT NULL DEFAULT 'UNMATCHED',
  note VARCHAR(300) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bank_line (legal_business_id, bank_account_id, line_hash),
  KEY idx_bank_line_date (legal_business_id, bank_account_id, line_date),
  KEY idx_bank_line_journal (journal_line_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_bank_verifications

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 375)

```sql
CREATE TABLE `acct_bank_verifications` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED NOT NULL,
  `evidence_document_id` bigint(20) UNSIGNED NOT NULL,
  `evidence_sha256` char(64) NOT NULL,
  `account_identity_fingerprint` char(64) NOT NULL,
  `verification_result` enum('VERIFIED','REJECTED') NOT NULL,
  `verification_method` enum('MANUAL_DOCUMENT_REVIEW') NOT NULL DEFAULT 'MANUAL_DOCUMENT_REVIEW',
  `verification_notes` text NOT NULL,
  `verified_by` bigint(20) UNSIGNED NOT NULL,
  `verified_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_verifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_bank_verification_account` (`legal_business_id`,`bank_account_id`,`verified_at`),
  ADD KEY `idx_bank_verification_evidence` (`evidence_document_id`),
  ADD KEY `fk_bank_verify_account` (`bank_account_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_verifications`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_bank_verifications`
  ADD CONSTRAINT `fk_bank_verification_evidence` FOREIGN KEY (`evidence_document_id`) REFERENCES `acct_bank_evidence` (`id`),
  ADD CONSTRAINT `fk_bank_verify_account` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`);
```

## acct_bill_terms

Definition: [migrations/066_bill_terms.sql](../../migrations/066_bill_terms.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_bill_terms (
  legal_business_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  body TEXT NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_bot_answers

Definition: [migrations/046_chatbot.sql](../../migrations/046_chatbot.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_bot_answers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  keywords VARCHAR(500) NOT NULL,
  reply VARCHAR(1500) NOT NULL,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bot_answers (legal_business_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## acct_bot_conversations

Definition: [migrations/046_chatbot.sql](../../migrations/046_chatbot.sql) (line 15)

```sql
CREATE TABLE IF NOT EXISTS acct_bot_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  wa_number VARCHAR(20) NOT NULL,
  contact_name VARCHAR(150) DEFAULT NULL,
  status ENUM('BOT','NEEDS_PERSON','DONE') NOT NULL DEFAULT 'BOT',
  awaiting ENUM('NONE','PRODUCT','ORDER') NOT NULL DEFAULT 'NONE',
  greeted_at DATETIME DEFAULT NULL,
  human_active_until DATETIME DEFAULT NULL,
  last_inbound_at DATETIME DEFAULT NULL,
  last_text VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_conv_number (legal_business_id, wa_number),
  KEY idx_bot_conv_status (legal_business_id, status, last_inbound_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## acct_bot_messages

Definition: [migrations/046_chatbot.sql](../../migrations/046_chatbot.sql) (line 32)

```sql
CREATE TABLE IF NOT EXISTS acct_bot_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  direction ENUM('IN','OUT') NOT NULL,
  body VARCHAR(2000) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  wa_message_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_msg_wa (wa_message_id),
  KEY idx_bot_msg_conv (conversation_id, id),
  KEY idx_bot_msg_kind (legal_business_id, kind, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## acct_branches

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 395)

```sql
CREATE TABLE `acct_branches` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `branch_code` varchar(32) NOT NULL,
  `branch_name` varchar(180) NOT NULL,
  `address_line1` varchar(255) DEFAULT NULL,
  `address_line2` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state` varchar(100) DEFAULT NULL,
  `postal_code` varchar(12) DEFAULT NULL,
  `opened_on` date DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_branches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_branch_code` (`legal_business_id`,`division_id`,`branch_code`),
  ADD UNIQUE KEY `uq_branch_business_division_id` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_branch_division` (`division_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_branches`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_branches`
  ADD CONSTRAINT `fk_branch_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_branch_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`);
```

## acct_business_documents

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 418)

```sql
CREATE TABLE `acct_business_documents` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `person_id` bigint(20) UNSIGNED DEFAULT NULL,
  `document_type` enum('GST_CERTIFICATE','PAN_DOCUMENT','UDYAM_CERTIFICATE','REGISTRATION_CERTIFICATE','AGREEMENT','OTHER') NOT NULL,
  `document_name` varchar(255) NOT NULL,
  `storage_key` varchar(500) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `file_size` bigint(20) UNSIGNED NOT NULL,
  `uploaded_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `status` enum('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  `archived_at` datetime DEFAULT NULL,
  `archived_by` bigint(20) UNSIGNED DEFAULT NULL,
  `archive_reason` varchar(500) DEFAULT NULL,
  `funding_agreement_id` bigint(20) UNSIGNED DEFAULT NULL,
  `agreement_version_id` bigint(20) UNSIGNED DEFAULT NULL,
  `agreement_document_role` enum('DRAFT','SIGNED','SUPPORTING','AMENDMENT') DEFAULT NULL,
  `document_sha256` char(64) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_documents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_doc_division` (`division_id`),
  ADD KEY `fk_doc_person` (`person_id`),
  ADD KEY `fk_doc_user` (`uploaded_by`),
  ADD KEY `idx_acct_documents_status` (`legal_business_id`,`status`),
  ADD KEY `idx_acct_doc_agreement` (`legal_business_id`,`funding_agreement_id`,`agreement_version_id`),
  ADD KEY `fk_acct_doc_agreement_version` (`agreement_version_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_documents`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_documents`
  ADD CONSTRAINT `fk_acct_doc_agreement_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`),
  ADD CONSTRAINT `fk_acct_doc_funding_agreement` FOREIGN KEY (`legal_business_id`,`funding_agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_doc_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_doc_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`),
  ADD CONSTRAINT `fk_doc_person` FOREIGN KEY (`person_id`) REFERENCES `acct_business_people` (`id`),
  ADD CONSTRAINT `fk_doc_user` FOREIGN KEY (`uploaded_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_business_people

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 446)

```sql
CREATE TABLE `acct_business_people` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `full_name` varchar(180) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `role` enum('LEGAL_PROPRIETOR','AUTHORIZED_REPRESENTATIVE','DIVISION_MANAGER') NOT NULL,
  `aadhaar_last4` char(4) DEFAULT NULL,
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_people`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_people_business` (`legal_business_id`),
  ADD KEY `idx_people_division` (`division_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_people`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_people`
  ADD CONSTRAINT `fk_people_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_people_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`);
```

## acct_business_settings

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 467)

```sql
CREATE TABLE `acct_business_settings` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `setting_key` varchar(80) NOT NULL,
  `setting_value` varchar(255) NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_settings`
  ADD PRIMARY KEY (`legal_business_id`,`setting_key`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_business_settings`
  ADD CONSTRAINT `fk_business_settings_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);
```

## acct_cash_accounts

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 481)

```sql
CREATE TABLE `acct_cash_accounts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `cash_code` varchar(32) NOT NULL,
  `cash_name` varchar(150) NOT NULL,
  `cash_type` enum('SHOP_CASH','PETTY_CASH','OWNER_HELD','OTHER') NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `custodian_name` varchar(150) NOT NULL,
  `gl_account_id` bigint(20) UNSIGNED NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `notes` varchar(1000) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_cash_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cash_business_code` (`legal_business_id`,`cash_code`),
  ADD UNIQUE KEY `uq_cash_business_gl` (`legal_business_id`,`gl_account_id`),
  ADD KEY `idx_cash_division_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_cash_division` (`division_id`,`legal_business_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_cash_accounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_cash_accounts`
  ADD CONSTRAINT `fk_cash_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_cash_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_cash_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_cash_gl` FOREIGN KEY (`legal_business_id`,`gl_account_id`) REFERENCES `acct_chart_of_accounts` (`legal_business_id`, `id`);
```

## acct_cash_closings

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 504)

```sql
CREATE TABLE `acct_cash_closings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `cash_account_id` bigint(20) UNSIGNED NOT NULL,
  `closing_date` date NOT NULL,
  `opening_amount` decimal(18,2) NOT NULL,
  `cash_in` decimal(18,2) NOT NULL,
  `cash_out` decimal(18,2) NOT NULL,
  `taken_out` decimal(18,2) NOT NULL DEFAULT 0.00,
  `expected_amount` decimal(18,2) NOT NULL,
  `counted_amount` decimal(18,2) NOT NULL,
  `difference` decimal(18,2) NOT NULL,
  `note` varchar(300) DEFAULT NULL,
  `closed_by` bigint(20) UNSIGNED NOT NULL,
  `closed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `redone_by` bigint(20) UNSIGNED DEFAULT NULL,
  `redone_at` datetime DEFAULT NULL,
  `denominations_json` text DEFAULT NULL,
  `taken_to` enum('BANK','OWNER') DEFAULT NULL,
  `taken_bank_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_cash_closings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cash_closing_day` (`legal_business_id`,`cash_account_id`,`closing_date`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_cash_closings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql)

```sql
ALTER TABLE acct_cash_closings MODIFY COLUMN taken_to ENUM('BANK','OWNER','CASH') NULL;
```

Change: [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql)

```sql
ALTER TABLE acct_cash_closings ADD COLUMN IF NOT EXISTS taken_cash_id BIGINT UNSIGNED NULL;
```

Change: [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql)

```sql
ALTER TABLE acct_cash_closings ADD COLUMN IF NOT EXISTS taken_owner_account_id BIGINT UNSIGNED NULL;
```

## acct_cash_note_log

Definition: [migrations/072_cash_note_log.sql](../../migrations/072_cash_note_log.sql) (line 4)

```sql
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
```

## acct_chart_of_accounts

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 532)

```sql
CREATE TABLE `acct_chart_of_accounts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `account_code` varchar(20) NOT NULL,
  `account_name` varchar(150) NOT NULL,
  `account_type` enum('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') NOT NULL,
  `account_subtype` varchar(60) NOT NULL,
  `normal_balance` enum('DEBIT','CREDIT') NOT NULL,
  `parent_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `is_posting_account` tinyint(1) NOT NULL DEFAULT 1,
  `is_system_account` tinyint(1) NOT NULL DEFAULT 0,
  `requires_division` tinyint(1) NOT NULL DEFAULT 0,
  `requires_branch` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `description` text DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_chart_of_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_coa_business_code` (`legal_business_id`,`account_code`),
  ADD UNIQUE KEY `uq_coa_business_id` (`legal_business_id`,`id`),
  ADD UNIQUE KEY `uq_coa_id_business` (`id`,`legal_business_id`),
  ADD KEY `idx_coa_business_type` (`legal_business_id`,`account_type`,`status`),
  ADD KEY `idx_coa_parent` (`legal_business_id`,`parent_account_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_chart_of_accounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_chart_of_accounts`
  ADD CONSTRAINT `fk_coa_new_parent` FOREIGN KEY (`legal_business_id`,`parent_account_id`) REFERENCES `acct_chart_of_accounts` (`legal_business_id`, `id`);
```

## acct_coupons

Definition: [migrations/063_rewards.sql](../../migrations/063_rewards.sql) (line 5)

```sql
CREATE TABLE IF NOT EXISTS acct_coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  kind ENUM('PERCENT','RUPEES') NOT NULL,
  value DECIMAL(18,2) NOT NULL,
  min_bill DECIMAL(18,2) NOT NULL DEFAULT 0,
  max_discount DECIMAL(18,2) NULL,
  starts_on DATE NULL,
  ends_on DATE NULL,
  once_per_customer TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_code (legal_business_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Change: [migrations/064_offer_branches.sql](../../migrations/064_offer_branches.sql)

```sql
ALTER TABLE acct_coupons ADD COLUMN IF NOT EXISTS division_id BIGINT UNSIGNED NULL;
```

Change: [migrations/064_offer_branches.sql](../../migrations/064_offer_branches.sql)

```sql
ALTER TABLE acct_coupons ADD COLUMN IF NOT EXISTS branch_id BIGINT UNSIGNED NULL;
```

## acct_customer_messages

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 583)

```sql
CREATE TABLE `acct_customer_messages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `message_type` enum('NEW_STOCK','DUES_REMINDER','OTHER') NOT NULL DEFAULT 'NEW_STOCK',
  `batch_key` varchar(120) NOT NULL,
  `sent_by` bigint(20) UNSIGNED DEFAULT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_customer_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_customer_message_batch` (`legal_business_id`,`batch_key`,`customer_id`),
  ADD KEY `idx_customer_message_customer` (`legal_business_id`,`customer_id`,`sent_at`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_customer_messages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_customer_notes

Definition: [migrations/067_customer_notes.sql](../../migrations/067_customer_notes.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_customer_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  note VARCHAR(500) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cust_notes (legal_business_id, customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Change: [migrations/078_follow_ups.sql](../../migrations/078_follow_ups.sql)

```sql
ALTER TABLE acct_customer_notes ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'NOTE';
```

Change: [migrations/078_follow_ups.sql](../../migrations/078_follow_ups.sql)

```sql
ALTER TABLE acct_customer_notes ADD COLUMN IF NOT EXISTS follow_up_on DATE NULL;
```

Change: [migrations/078_follow_ups.sql](../../migrations/078_follow_ups.sql)

```sql
ALTER TABLE acct_customer_notes ADD COLUMN IF NOT EXISTS follow_done_at DATETIME NULL;
```

Change: [migrations/078_follow_ups.sql](../../migrations/078_follow_ups.sql)

```sql
ALTER TABLE acct_customer_notes ADD INDEX IF NOT EXISTS idx_cust_follow (legal_business_id, follow_up_on, follow_done_at);
```

## acct_customers

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 558)

```sql
CREATE TABLE `acct_customers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `customer_code` varchar(30) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `customer_type` enum('RETAIL','WHOLESALE') NOT NULL DEFAULT 'RETAIL',
  `address` varchar(300) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `credit_limit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `whatsapp_opt_in` tinyint(1) NOT NULL DEFAULT 0,
  `notes` varchar(500) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `linked_supplier_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_customer_code` (`legal_business_id`,`customer_code`),
  ADD UNIQUE KEY `uq_customer_phone` (`legal_business_id`,`phone`),
  ADD KEY `idx_customer_name` (`legal_business_id`,`full_name`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_customers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_customers`
  ADD CONSTRAINT `fk_customer_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);
```

Change: [migrations/074_wa_broadcasts.sql](../../migrations/074_wa_broadcasts.sql)

```sql
ALTER TABLE acct_customers ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at DATETIME NULL;
```

## acct_deals

Definition: [migrations/069_deals.sql](../../migrations/069_deals.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_deals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  party_name VARCHAR(160) NOT NULL,
  phone CHAR(10) NULL,
  customer_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  expected_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  stage ENUM('ENQUIRY','QUOTED','NEGOTIATING','WON','LOST') NOT NULL DEFAULT 'ENQUIRY',
  expected_close DATE NULL,
  note VARCHAR(500) NULL,
  lost_reason VARCHAR(200) NULL,
  closed_on DATE NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_deals_stage (legal_business_id, stage, expected_close)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_divisions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 599)

```sql
CREATE TABLE `acct_divisions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(180) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_divisions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_division_code` (`legal_business_id`,`code`),
  ADD UNIQUE KEY `uq_division_business_id` (`id`,`legal_business_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_divisions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_divisions`
  ADD CONSTRAINT `acct_divisions_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);
```

## acct_document_copies

Definition: [migrations/058_document_register.sql](../../migrations/058_document_register.sql) (line 4)

```sql
CREATE TABLE IF NOT EXISTS acct_document_copies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  doc_type ENUM('INVOICE','ESTIMATE','VOUCHER','EXPENSE_RECORD') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  doc_ref VARCHAR(80) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_doc_copy_source (legal_business_id, doc_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_document_log

Definition: [migrations/058_document_register.sql](../../migrations/058_document_register.sql) (line 17)

```sql
CREATE TABLE IF NOT EXISTS acct_document_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  doc_type ENUM('INVOICE','ESTIMATE','VOUCHER','EXPENSE_RECORD') NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  doc_ref VARCHAR(80) NOT NULL,
  event ENUM('PRINT','REPRINT') NOT NULL,
  reason VARCHAR(300) NULL,
  copy_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_doc_log_source (legal_business_id, doc_type, source_id),
  KEY idx_doc_log_time (legal_business_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_document_sequences

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 614)

```sql
CREATE TABLE `acct_document_sequences` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `document_type` varchar(20) NOT NULL,
  `code_prefix` varchar(40) NOT NULL,
  `last_number` bigint(20) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_document_sequences`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_document_sequence` (`legal_business_id`,`document_type`,`code_prefix`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_document_sequences`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_document_sequences`
  ADD CONSTRAINT `fk_document_sequence_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);
```

## acct_employee_pay_history

Definition: [migrations/062_staff_record.sql](../../migrations/062_staff_record.sql) (line 8)

```sql
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
```

## acct_employees

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 628)

```sql
CREATE TABLE `acct_employees` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `full_name` varchar(150) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `job_title` varchar(100) DEFAULT NULL,
  `monthly_salary` decimal(18,2) NOT NULL,
  `joined_on` date DEFAULT NULL,
  `status` enum('ACTIVE','LEFT') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_employees`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_employee_business` (`legal_business_id`,`status`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_employees`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/062_staff_record.sql](../../migrations/062_staff_record.sql)

```sql
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS notice_given_on DATE NULL;
```

Change: [migrations/062_staff_record.sql](../../migrations/062_staff_record.sql)

```sql
ALTER TABLE acct_employees ADD COLUMN IF NOT EXISTS left_on DATE NULL;
```

## acct_expense_payments

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 675)

```sql
CREATE TABLE `acct_expense_payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `expense_id` bigint(20) UNSIGNED NOT NULL,
  `payment_date` date NOT NULL,
  `payment_method` enum('CASH','UPI','BANK_TRANSFER','CARD','CHEQUE','OTHER','ADVANCE') NOT NULL,
  `payment_source` enum('BUSINESS_BANK','BUSINESS_CASH','INVESTOR_BANK','INVESTOR_CASH','OWNER_PERSONAL') NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `funding_party_id` bigint(20) UNSIGNED DEFAULT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_reference` varchar(150) DEFAULT NULL,
  `remarks` varchar(300) DEFAULT NULL,
  `status` enum('RECORDED','VOID') NOT NULL DEFAULT 'RECORDED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_expense_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_expense_payment_expense` (`legal_business_id`,`division_id`,`expense_id`),
  ADD KEY `idx_expense_payment_date` (`legal_business_id`,`payment_date`),
  ADD KEY `idx_expense_payment_bank` (`bank_account_id`),
  ADD KEY `idx_expense_payment_cash` (`cash_account_id`),
  ADD KEY `fk_exp_pay_funding_party` (`legal_business_id`,`funding_party_id`),
  ADD KEY `fk_exp_pay_creator` (`created_by`),
  ADD KEY `fk_exp_pay_expense_business` (`legal_business_id`,`expense_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_expense_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_expense_payments`
  ADD CONSTRAINT `fk_exp_pay_bank` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_exp_pay_cash` FOREIGN KEY (`cash_account_id`) REFERENCES `acct_cash_accounts` (`id`),
  ADD CONSTRAINT `fk_exp_pay_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_exp_pay_expense_business` FOREIGN KEY (`legal_business_id`,`expense_id`) REFERENCES `acct_expenses` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_exp_pay_funding_party` FOREIGN KEY (`legal_business_id`,`funding_party_id`) REFERENCES `acct_funding_parties` (`legal_business_id`, `id`);
```

Change: [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql)

```sql
ALTER TABLE acct_expense_payments ADD COLUMN IF NOT EXISTS owner_account_id BIGINT UNSIGNED NULL;
```

## acct_expenses

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 649)

```sql
CREATE TABLE `acct_expenses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `allocation_level` enum('GROUP','DIVISION','BRANCH') NOT NULL DEFAULT 'DIVISION',
  `expense_no` varchar(60) NOT NULL,
  `expense_date` date NOT NULL,
  `category` enum('RENT','ELECTRICITY','TRANSPORT','PACKING','SALARY','MAINTENANCE','MARKETING','INTERNET_PHONE','OFFICE_SUPPLIES','BANK_CHARGES','MISCELLANEOUS') NOT NULL,
  `is_setup_cost` tinyint(1) NOT NULL DEFAULT 0,
  `description` varchar(500) NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `status` enum('DRAFT','CONFIRMED','VOID') NOT NULL DEFAULT 'DRAFT',
  `remarks` varchar(500) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `confirmed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_expenses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_expense_no` (`legal_business_id`,`expense_no`),
  ADD UNIQUE KEY `uq_expense_scope` (`legal_business_id`,`division_id`,`id`),
  ADD UNIQUE KEY `uq_expense_business_id` (`legal_business_id`,`id`),
  ADD KEY `idx_expense_date` (`legal_business_id`,`division_id`,`expense_date`),
  ADD KEY `idx_expense_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_expense_creator` (`created_by`),
  ADD KEY `fk_expense_confirmer` (`confirmed_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_expenses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_expenses`
  ADD CONSTRAINT `fk_expense_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_expense_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_expense_confirmer` FOREIGN KEY (`confirmed_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_expense_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);
```

Change: [migrations/057_expense_payee.sql](../../migrations/057_expense_payee.sql)

```sql
ALTER TABLE acct_expenses ADD COLUMN IF NOT EXISTS payee_name VARCHAR(150) NULL AFTER description;
```

## acct_financial_scenarios

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 700)

```sql
CREATE TABLE `acct_financial_scenarios` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `name` varchar(160) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('DRAFT','APPROVED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_financial_scenarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `legal_business_id` (`legal_business_id`),
  ADD KEY `division_id` (`division_id`,`legal_business_id`),
  ADD KEY `created_by` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_financial_scenarios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_financial_scenarios`
  ADD CONSTRAINT `acct_financial_scenarios_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_financial_scenarios_ibfk_2` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_financial_scenarios_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_financial_years

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 717)

```sql
CREATE TABLE `acct_financial_years` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `label` varchar(16) NOT NULL,
  `starts_on` date NOT NULL,
  `ends_on` date NOT NULL,
  `status` enum('OPEN','LOCKED','CLOSED') NOT NULL DEFAULT 'OPEN'
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_financial_years`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_business_fy` (`legal_business_id`,`label`),
  ADD UNIQUE KEY `uq_fy_business_id` (`id`,`legal_business_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_financial_years`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_financial_years`
  ADD CONSTRAINT `acct_financial_years_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);
```

## acct_fixed_assets

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 732)

```sql
CREATE TABLE `acct_fixed_assets` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `asset_no` varchar(40) NOT NULL,
  `asset_name` varchar(160) NOT NULL,
  `category` enum('FURNITURE_FITTINGS','MACHINERY','COMPUTERS','VEHICLE','OTHER') NOT NULL DEFAULT 'OTHER',
  `purchase_date` date NOT NULL,
  `cost` decimal(18,2) NOT NULL,
  `salvage_value` decimal(18,2) NOT NULL DEFAULT 0.00,
  `life_months` int(10) UNSIGNED NOT NULL,
  `paid_from` enum('CASH','BANK','EARLIER') NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `status` enum('ACTIVE','DISPOSED') NOT NULL DEFAULT 'ACTIVE',
  `disposed_on` date DEFAULT NULL,
  `disposal_kind` enum('SOLD','SCRAPPED','GIVEN_AWAY') DEFAULT NULL,
  `proceeds` decimal(18,2) NOT NULL DEFAULT 0.00,
  `proceeds_bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `proceeds_cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `disposal_note` varchar(250) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_fixed_assets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_fixed_asset_no` (`legal_business_id`,`asset_no`),
  ADD KEY `idx_fixed_asset_status` (`legal_business_id`,`division_id`,`status`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_fixed_assets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_free_stock

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 764)

```sql
CREATE TABLE `acct_free_stock` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `entry_no` varchar(60) NOT NULL,
  `given_date` date NOT NULL,
  `given_to` varchar(150) NOT NULL,
  `customer_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reason` varchar(300) NOT NULL,
  `status` enum('WAITING','APPROVED','REJECTED') NOT NULL DEFAULT 'WAITING',
  `total_cost` decimal(18,2) DEFAULT NULL,
  `requested_by` bigint(20) UNSIGNED NOT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `reject_reason` varchar(300) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_free_stock`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_free_stock_no` (`legal_business_id`,`entry_no`),
  ADD KEY `idx_free_stock_status` (`legal_business_id`,`status`,`given_date`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_free_stock`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_free_stock_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 790)

```sql
CREATE TABLE `acct_free_stock_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `free_stock_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) DEFAULT NULL,
  `total_cost` decimal(18,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_free_stock_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_free_stock_lines_entry` (`legal_business_id`,`free_stock_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_free_stock_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_funding_agreements

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 806)

```sql
CREATE TABLE `acct_funding_agreements` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `party_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_no` varchar(40) NOT NULL,
  `funding_type` enum('LOAN','PROFIT_LINKED') NOT NULL,
  `funding_commitment_mode` enum('FIXED','OPEN_ENDED') NOT NULL DEFAULT 'FIXED',
  `committed_amount` decimal(18,2) DEFAULT NULL,
  `profit_share_percentage` decimal(7,4) DEFAULT NULL,
  `profit_basis` varchar(100) DEFAULT NULL,
  `interest_rate_percentage` decimal(7,4) DEFAULT NULL,
  `interest_method` enum('NONE','SIMPLE','REDUCING_BALANCE') NOT NULL DEFAULT 'NONE',
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `payout_frequency` enum('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','ON_MATURITY','CUSTOM') NOT NULL DEFAULT 'CUSTOM',
  `principal_repayment_terms` text DEFAULT NULL,
  `loss_sharing_terms` text DEFAULT NULL,
  `agreement_notes` text DEFAULT NULL,
  `status` enum('DRAFT','ACTIVE','CLOSED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_agreements`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_funding_agreement_no` (`legal_business_id`,`agreement_no`),
  ADD UNIQUE KEY `uq_funding_agreement_business_id` (`legal_business_id`,`id`),
  ADD KEY `fk_agreement_party` (`legal_business_id`,`party_id`),
  ADD KEY `fk_agreement_division` (`division_id`),
  ADD KEY `fk_agreement_user` (`created_by`),
  ADD KEY `idx_funding_agreement_branch` (`branch_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_agreements`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_agreements`
  ADD CONSTRAINT `fk_agreement_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_agreement_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`),
  ADD CONSTRAINT `fk_agreement_party` FOREIGN KEY (`legal_business_id`,`party_id`) REFERENCES `acct_funding_parties` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_agreement_user` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_funding_agreement_branch` FOREIGN KEY (`branch_id`) REFERENCES `acct_branches` (`id`);
```

## acct_funding_parties

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 837)

```sql
CREATE TABLE `acct_funding_parties` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `party_code` varchar(32) NOT NULL,
  `party_type` enum('INDIVIDUAL','BUSINESS','FINANCIAL_INSTITUTION') NOT NULL DEFAULT 'INDIVIDUAL',
  `full_name` varchar(180) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `pan_last4` char(4) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_parties`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_funding_party_code` (`legal_business_id`,`party_code`),
  ADD UNIQUE KEY `uq_funding_party_business_id` (`legal_business_id`,`id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_parties`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_parties`
  ADD CONSTRAINT `fk_funding_party_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);
```

## acct_funding_transactions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 858)

```sql
CREATE TABLE `acct_funding_transactions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_version_id` bigint(20) UNSIGNED DEFAULT NULL,
  `transaction_no` varchar(40) NOT NULL,
  `transaction_date` date NOT NULL,
  `transaction_type` enum('FUNDING_RECEIVED','PRINCIPAL_REPAID','RETURN_PAID') NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` enum('BANK_TRANSFER','UPI','CASH','CHEQUE','OTHER') NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payment_reference` varchar(120) DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `journal_entry_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('DRAFT','VERIFIED','VOID') NOT NULL DEFAULT 'DRAFT',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `verified_by` bigint(20) UNSIGNED DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_transactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_funding_transaction_no` (`legal_business_id`,`transaction_no`),
  ADD KEY `fk_funding_tx_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_funding_tx_journal` (`journal_entry_id`),
  ADD KEY `fk_funding_tx_user` (`created_by`),
  ADD KEY `idx_funding_tx_agreement_date` (`agreement_id`,`transaction_date`),
  ADD KEY `fk_funding_tx_version` (`agreement_version_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_transactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_funding_transactions`
  ADD CONSTRAINT `fk_funding_tx_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_funding_tx_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_funding_tx_journal` FOREIGN KEY (`journal_entry_id`) REFERENCES `acct_journal_entries` (`id`),
  ADD CONSTRAINT `fk_funding_tx_user` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_funding_tx_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`);
```

Change: [migrations/047_investor_returns.sql](../../migrations/047_investor_returns.sql)

```sql
ALTER TABLE acct_funding_transactions
  ADD COLUMN IF NOT EXISTS return_treatment ENUM('PROFIT_SHARE','COST') NULL;
```

## acct_historical_funding_batches

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 886)

```sql
CREATE TABLE `acct_historical_funding_batches` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `batch_reference` varchar(50) NOT NULL,
  `description` varchar(500) NOT NULL,
  `status` enum('DRAFT','UNDER_REVIEW','APPROVED','IMPORTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `imported_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_historical_funding_batches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_historical_funding_batch_ref` (`legal_business_id`,`batch_reference`),
  ADD UNIQUE KEY `uq_historical_funding_batch_scope` (`legal_business_id`,`id`),
  ADD KEY `fk_historical_batch_creator` (`created_by`),
  ADD KEY `fk_historical_batch_approver` (`approved_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_historical_funding_batches`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_historical_funding_batches`
  ADD CONSTRAINT `fk_historical_batch_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_historical_batch_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_historical_batch_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_historical_funding_items

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 905)

```sql
CREATE TABLE `acct_historical_funding_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `batch_id` bigint(20) UNSIGNED NOT NULL,
  `line_no` int(10) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_version_id` bigint(20) UNSIGNED DEFAULT NULL,
  `transaction_date` date NOT NULL,
  `transaction_type` enum('FUNDING_RECEIVED','PRINCIPAL_REPAID','RETURN_PAID') NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` enum('BANK_TRANSFER','UPI','CASH','CHEQUE','OTHER') NOT NULL,
  `payment_reference` varchar(120) DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `evidence_reference` varchar(255) DEFAULT NULL,
  `validation_status` enum('PENDING','VALID','INVALID') NOT NULL DEFAULT 'PENDING',
  `validation_notes` varchar(1000) DEFAULT NULL,
  `imported_transaction_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_historical_funding_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_historical_item_line` (`batch_id`,`line_no`),
  ADD UNIQUE KEY `uq_historical_imported_transaction` (`imported_transaction_id`),
  ADD KEY `idx_historical_item_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_historical_item_batch` (`legal_business_id`,`batch_id`),
  ADD KEY `fk_historical_item_version` (`agreement_version_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_historical_funding_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_historical_funding_items`
  ADD CONSTRAINT `fk_historical_item_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_historical_item_batch` FOREIGN KEY (`legal_business_id`,`batch_id`) REFERENCES `acct_historical_funding_batches` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_historical_item_transaction` FOREIGN KEY (`imported_transaction_id`) REFERENCES `acct_funding_transactions` (`id`),
  ADD CONSTRAINT `fk_historical_item_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`);
```

## acct_instagram_posts

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 931)

```sql
CREATE TABLE `acct_instagram_posts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `media_id` bigint(20) UNSIGNED NOT NULL,
  `caption` varchar(2200) NOT NULL,
  `status` enum('POSTED','FAILED') NOT NULL,
  `instagram_media_id` varchar(40) DEFAULT NULL,
  `error_text` varchar(300) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_instagram_posts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ig_product` (`legal_business_id`,`product_id`,`created_at`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_instagram_posts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/049_social_posts.sql](../../migrations/049_social_posts.sql)

```sql
ALTER TABLE acct_instagram_posts
  ADD COLUMN IF NOT EXISTS channel ENUM('INSTAGRAM','FACEBOOK') NOT NULL DEFAULT 'INSTAGRAM',
  ADD COLUMN IF NOT EXISTS media_count INT UNSIGNED NOT NULL DEFAULT 1;
```

## acct_inventory_locations

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 950)

```sql
CREATE TABLE `acct_inventory_locations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `location_code` varchar(30) NOT NULL,
  `location_name` varchar(150) NOT NULL,
  `location_type` enum('CENTRAL_WAREHOUSE','WAREHOUSE','RETAIL','STOCKROOM','OTHER') NOT NULL,
  `address` varchar(500) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_inventory_locations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_inventory_location_code` (`legal_business_id`,`location_code`),
  ADD UNIQUE KEY `uq_inventory_location_scope` (`legal_business_id`,`id`),
  ADD KEY `idx_inventory_location_division` (`legal_business_id`,`division_id`),
  ADD KEY `idx_inventory_location_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_inventory_location_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_inventory_location_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_inventory_locations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_inventory_locations`
  ADD CONSTRAINT `fk_inventory_location_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_inventory_location_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_inventory_location_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_inventory_location_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);
```

## acct_investor_bank_scopes

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 971)

```sql
CREATE TABLE `acct_investor_bank_scopes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `funding_party_id` bigint(20) UNSIGNED NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `purpose` enum('FUNDING_RECEIPT','REPAYMENT','PROFIT_PAYOUT','ALL') NOT NULL DEFAULT 'ALL',
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_investor_bank_scopes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_investor_bank_scope` (`bank_account_id`,`legal_business_id`,`funding_party_id`,`division_id`,`branch_id`),
  ADD KEY `idx_investor_scope` (`legal_business_id`,`funding_party_id`,`division_id`,`branch_id`),
  ADD KEY `fk_ibs_party` (`funding_party_id`),
  ADD KEY `fk_ibs_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_ibs_branch` (`legal_business_id`,`division_id`,`branch_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_investor_bank_scopes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_investor_bank_scopes`
  ADD CONSTRAINT `fk_ibs_bank` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_ibs_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_ibs_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_ibs_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_ibs_party` FOREIGN KEY (`funding_party_id`) REFERENCES `acct_funding_parties` (`id`);
```

## acct_invoice_shares

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 990)

```sql
CREATE TABLE `acct_invoice_shares` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `sale_id` bigint(20) UNSIGNED NOT NULL,
  `token` char(32) NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_invoice_shares`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_invoice_share_sale` (`legal_business_id`,`sale_id`),
  ADD UNIQUE KEY `uq_invoice_share_token` (`token`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_invoice_shares`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_journal_entries

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1005)

```sql
CREATE TABLE `acct_journal_entries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `financial_year_id` bigint(20) UNSIGNED NOT NULL,
  `accounting_period_id` bigint(20) UNSIGNED DEFAULT NULL,
  `journal_no` varchar(36) NOT NULL,
  `draft_reference` varchar(36) DEFAULT NULL,
  `entry_date` date NOT NULL,
  `description` varchar(500) NOT NULL,
  `source_type` varchar(48) DEFAULT NULL,
  `source_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('DRAFT','POSTED','REVERSED') NOT NULL DEFAULT 'DRAFT',
  `posted_at` datetime DEFAULT NULL,
  `posted_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_entries`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_journal_no` (`legal_business_id`,`journal_no`),
  ADD UNIQUE KEY `uq_journal_business_id` (`id`,`legal_business_id`),
  ADD KEY `idx_journal_date` (`legal_business_id`,`entry_date`,`status`),
  ADD KEY `financial_year_id` (`financial_year_id`,`legal_business_id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `fk_journal_period_business` (`legal_business_id`,`accounting_period_id`),
  ADD KEY `idx_journal_source` (`legal_business_id`,`source_type`,`source_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_entries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_entries`
  ADD CONSTRAINT `acct_journal_entries_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_journal_entries_ibfk_2` FOREIGN KEY (`financial_year_id`,`legal_business_id`) REFERENCES `acct_financial_years` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_journal_entries_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_journal_period_business` FOREIGN KEY (`legal_business_id`,`accounting_period_id`) REFERENCES `acct_accounting_periods` (`legal_business_id`, `id`);
```

## acct_journal_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1060)

```sql
CREATE TABLE `acct_journal_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `journal_entry_id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `line_no` smallint(5) UNSIGNED NOT NULL,
  `account_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `debit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `credit` decimal(18,2) NOT NULL DEFAULT 0.00
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_journal_line` (`journal_entry_id`,`line_no`),
  ADD KEY `idx_account_division` (`legal_business_id`,`account_id`,`division_id`),
  ADD KEY `journal_entry_id` (`journal_entry_id`,`legal_business_id`),
  ADD KEY `division_id` (`division_id`,`legal_business_id`),
  ADD KEY `acct_journal_lines_ibfk_2` (`account_id`,`legal_business_id`),
  ADD KEY `idx_journal_branch` (`legal_business_id`,`division_id`,`branch_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_lines`
  ADD CONSTRAINT `acct_journal_lines_ibfk_1` FOREIGN KEY (`journal_entry_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_journal_lines_ibfk_2` FOREIGN KEY (`account_id`,`legal_business_id`) REFERENCES `acct_chart_of_accounts` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_journal_lines_ibfk_3` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_journal_line_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`);
```

## acct_journal_post_sequences

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1144)

```sql
CREATE TABLE `acct_journal_post_sequences` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `financial_year_id` bigint(20) UNSIGNED NOT NULL,
  `last_number` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_post_sequences`
  ADD PRIMARY KEY (`legal_business_id`,`financial_year_id`),
  ADD KEY `fk_journal_seq_fy` (`financial_year_id`,`legal_business_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_post_sequences`
  ADD CONSTRAINT `fk_journal_seq_fy` FOREIGN KEY (`financial_year_id`,`legal_business_id`) REFERENCES `acct_financial_years` (`id`, `legal_business_id`);
```

## acct_journal_reversals

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1157)

```sql
CREATE TABLE `acct_journal_reversals` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `original_journal_id` bigint(20) UNSIGNED NOT NULL,
  `reversal_journal_id` bigint(20) UNSIGNED NOT NULL,
  `reversal_reason` varchar(1000) NOT NULL,
  `reversed_by` bigint(20) UNSIGNED NOT NULL,
  `reversed_at` datetime NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_reversals`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_original_reversal` (`legal_business_id`,`original_journal_id`),
  ADD UNIQUE KEY `uq_reversal_journal` (`legal_business_id`,`reversal_journal_id`),
  ADD KEY `fk_reversal_original` (`original_journal_id`,`legal_business_id`),
  ADD KEY `fk_reversal_journal` (`reversal_journal_id`,`legal_business_id`),
  ADD KEY `fk_reversal_actor` (`reversed_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_reversals`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_reversals`
  ADD CONSTRAINT `fk_reversal_actor` FOREIGN KEY (`reversed_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_reversal_journal` FOREIGN KEY (`reversal_journal_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_reversal_original` FOREIGN KEY (`original_journal_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`);
```

## acct_journal_sequences

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1173)

```sql
CREATE TABLE `acct_journal_sequences` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `fiscal_year_label` varchar(9) NOT NULL,
  `last_number` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_journal_sequences`
  ADD PRIMARY KEY (`legal_business_id`,`fiscal_year_label`);
```

## acct_leads

Definition: [migrations/068_leads.sql](../../migrations/068_leads.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  phone CHAR(10) NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'OTHER',
  interest VARCHAR(300) NULL,
  status ENUM('NEW','FOLLOW_UP','WON','LOST') NOT NULL DEFAULT 'NEW',
  follow_up_on DATE NULL,
  note VARCHAR(500) NULL,
  customer_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_leads_status (legal_business_id, status, follow_up_on),
  KEY idx_leads_phone (legal_business_id, phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_legal_businesses

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1186)

```sql
CREATE TABLE `acct_legal_businesses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_name` varchar(180) NOT NULL,
  `trading_name` varchar(180) DEFAULT NULL,
  `legal_form` enum('PROPRIETORSHIP','PARTNERSHIP','LLP','COMPANY','OTHER') NOT NULL DEFAULT 'PROPRIETORSHIP',
  `currency_code` char(3) NOT NULL DEFAULT 'INR',
  `pan_last4` char(4) DEFAULT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `udyam_registration_no` varchar(25) DEFAULT NULL,
  `registration_year` smallint(5) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_legal_businesses`
  ADD PRIMARY KEY (`id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_legal_businesses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_login_attempts

Definition: [migrations/054_login_attempts.sql](../../migrations/054_login_attempts.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_email_time (email, attempted_at),
  KEY idx_login_ip_time (ip, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_login_challenges

Definition: [migrations/065_two_step_login.sql](../../migrations/065_two_step_login.sql) (line 18)

```sql
CREATE TABLE IF NOT EXISTS acct_login_challenges (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  KEY idx_challenge_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_offer_products

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1228)

```sql
CREATE TABLE `acct_offer_products` (
  `offer_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_offer_products`
  ADD PRIMARY KEY (`offer_id`,`product_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_offer_products`
  ADD CONSTRAINT `fk_offer_products_offer` FOREIGN KEY (`offer_id`) REFERENCES `acct_offers` (`id`) ON DELETE CASCADE;
```

## acct_offers

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1206)

```sql
CREATE TABLE `acct_offers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `offer_name` varchar(80) NOT NULL,
  `channel` enum('STORE','ONLINE','BOTH') NOT NULL DEFAULT 'BOTH',
  `kind` enum('PERCENT','AMOUNT_OFF','FIXED_PRICE') NOT NULL,
  `offer_value` decimal(14,2) NOT NULL,
  `scope` enum('ALL','FABRIC','PRODUCTS') NOT NULL DEFAULT 'ALL',
  `fabric` varchar(100) DEFAULT NULL,
  `starts_on` date DEFAULT NULL,
  `ends_on` date DEFAULT NULL,
  `status` enum('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_offers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_offers_business` (`legal_business_id`,`status`,`starts_on`,`ends_on`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_offers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/064_offer_branches.sql](../../migrations/064_offer_branches.sql)

```sql
ALTER TABLE acct_offers ADD COLUMN IF NOT EXISTS division_id BIGINT UNSIGNED NULL;
```

Change: [migrations/064_offer_branches.sql](../../migrations/064_offer_branches.sql)

```sql
ALTER TABLE acct_offers ADD COLUMN IF NOT EXISTS branch_id BIGINT UNSIGNED NULL;
```

## acct_online_order_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1269)

```sql
CREATE TABLE `acct_online_order_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `product_name` varchar(200) NOT NULL,
  `detail` varchar(120) DEFAULT NULL,
  `quantity` int(10) UNSIGNED NOT NULL,
  `unit_price` decimal(14,2) NOT NULL,
  `list_price` decimal(14,2) DEFAULT NULL,
  `offer_name` varchar(80) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_online_order_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_online_line_order` (`order_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_online_order_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_online_order_lines`
  ADD CONSTRAINT `fk_online_line_order` FOREIGN KEY (`order_id`) REFERENCES `acct_online_orders` (`id`);
```

## acct_online_orders

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1239)

```sql
CREATE TABLE `acct_online_orders` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `order_no` varchar(20) NOT NULL,
  `status` enum('REQUESTED','CONFIRMED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'REQUESTED',
  `customer_name` varchar(120) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `email` varchar(160) DEFAULT NULL,
  `country` varchar(80) NOT NULL,
  `address_line` varchar(300) NOT NULL,
  `city` varchar(100) NOT NULL,
  `state_region` varchar(100) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `customer_note` varchar(500) DEFAULT NULL,
  `items_total` decimal(14,2) NOT NULL,
  `shipping_charge` decimal(14,2) NOT NULL DEFAULT 0.00,
  `staff_note` varchar(500) DEFAULT NULL,
  `handled_by` bigint(20) UNSIGNED DEFAULT NULL,
  `handled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `shop_customer_id` bigint(20) UNSIGNED DEFAULT NULL,
  `sale_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_online_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_online_order_no` (`legal_business_id`,`order_no`),
  ADD KEY `idx_online_order_status` (`legal_business_id`,`status`,`created_at`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_online_orders`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_opening_balance_authorizations

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1287)

```sql
CREATE TABLE `acct_opening_balance_authorizations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `batch_id` bigint(20) UNSIGNED NOT NULL,
  `status` enum('APPROVED','REVOKED') NOT NULL DEFAULT 'APPROVED',
  `opening_date` date NOT NULL,
  `cash_count_confirmed` tinyint(1) NOT NULL,
  `bank_statements_confirmed` tinyint(1) NOT NULL,
  `inventory_valuation_confirmed` tinyint(1) NOT NULL,
  `liabilities_confirmed` tinyint(1) NOT NULL,
  `funding_reconciliation_confirmed` tinyint(1) NOT NULL,
  `cutover_reconciliation_confirmed` tinyint(1) NOT NULL,
  `reconciliation_notes` text NOT NULL,
  `worksheet_hash` char(64) NOT NULL,
  `approved_by` bigint(20) UNSIGNED NOT NULL,
  `approved_at` datetime NOT NULL DEFAULT current_timestamp(),
  `revoked_by` bigint(20) UNSIGNED DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `revocation_reason` varchar(1000) DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_authorizations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_authorization_batch` (`legal_business_id`,`batch_id`),
  ADD KEY `fk_oba_approver` (`approved_by`),
  ADD KEY `fk_oba_revoker` (`revoked_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_authorizations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_authorizations`
  ADD CONSTRAINT `fk_oba_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_oba_batch` FOREIGN KEY (`legal_business_id`,`batch_id`) REFERENCES `acct_opening_balance_batches` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_oba_revoker` FOREIGN KEY (`revoked_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_opening_balance_batches

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1314)

```sql
CREATE TABLE `acct_opening_balance_batches` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `opening_date` date NOT NULL,
  `financial_year_id` bigint(20) UNSIGNED NOT NULL,
  `accounting_period_id` bigint(20) UNSIGNED NOT NULL,
  `status` enum('DRAFT','POSTED') NOT NULL DEFAULT 'DRAFT',
  `description` varchar(500) NOT NULL,
  `posted_journal_id` bigint(20) UNSIGNED DEFAULT NULL,
  `posted_by` bigint(20) UNSIGNED DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `updated_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_batches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_business` (`legal_business_id`),
  ADD UNIQUE KEY `uq_opening_business_id` (`legal_business_id`,`id`),
  ADD UNIQUE KEY `uq_opening_posted_journal` (`posted_journal_id`),
  ADD KEY `fk_opening_fy` (`financial_year_id`,`legal_business_id`),
  ADD KEY `fk_opening_period` (`legal_business_id`,`accounting_period_id`),
  ADD KEY `fk_opening_journal` (`posted_journal_id`,`legal_business_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_batches`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_batches`
  ADD CONSTRAINT `fk_opening_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_opening_fy` FOREIGN KEY (`financial_year_id`,`legal_business_id`) REFERENCES `acct_financial_years` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_opening_journal` FOREIGN KEY (`posted_journal_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_opening_period` FOREIGN KEY (`legal_business_id`,`accounting_period_id`) REFERENCES `acct_accounting_periods` (`legal_business_id`, `id`);
```

## acct_opening_balance_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1337)

```sql
CREATE TABLE `acct_opening_balance_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `batch_id` bigint(20) UNSIGNED NOT NULL,
  `line_no` smallint(5) UNSIGNED NOT NULL,
  `account_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `debit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `credit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `notes` varchar(500) DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_line` (`batch_id`,`line_no`),
  ADD UNIQUE KEY `uq_opening_line_business_id` (`legal_business_id`,`id`),
  ADD KEY `idx_opening_account` (`legal_business_id`,`account_id`),
  ADD KEY `fk_opening_line_batch` (`legal_business_id`,`batch_id`),
  ADD KEY `fk_opening_line_account` (`account_id`,`legal_business_id`),
  ADD KEY `fk_opening_line_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_opening_line_branch` (`legal_business_id`,`division_id`,`branch_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_balance_lines`
  ADD CONSTRAINT `fk_opening_line_account` FOREIGN KEY (`account_id`,`legal_business_id`) REFERENCES `acct_chart_of_accounts` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_opening_line_batch` FOREIGN KEY (`legal_business_id`,`batch_id`) REFERENCES `acct_opening_balance_batches` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_opening_line_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_opening_line_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);
```

## acct_opening_funding_details

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1356)

```sql
CREATE TABLE `acct_opening_funding_details` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `opening_line_id` bigint(20) UNSIGNED NOT NULL,
  `funding_party_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED DEFAULT NULL,
  `funding_reference` varchar(100) NOT NULL,
  `classification` enum('REPAYABLE_LIABILITY','OTHER_EQUITY','OTHER_OBLIGATION') NOT NULL,
  `opening_amount` decimal(18,2) NOT NULL,
  `remarks` varchar(1000) DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_funding_details`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_funding_line` (`legal_business_id`,`opening_line_id`),
  ADD KEY `idx_opening_funding_party` (`legal_business_id`,`funding_party_id`),
  ADD KEY `fk_ofd_party` (`funding_party_id`),
  ADD KEY `idx_opening_funding_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_opening_funding_agreement` (`agreement_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_funding_details`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_funding_details`
  ADD CONSTRAINT `fk_ofd_line` FOREIGN KEY (`legal_business_id`,`opening_line_id`) REFERENCES `acct_opening_balance_lines` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_ofd_party` FOREIGN KEY (`funding_party_id`) REFERENCES `acct_funding_parties` (`id`),
  ADD CONSTRAINT `fk_opening_funding_agreement` FOREIGN KEY (`agreement_id`) REFERENCES `acct_funding_agreements` (`id`);
```

## acct_opening_investor_bank_balances

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1374)

```sql
CREATE TABLE `acct_opening_investor_bank_balances` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `batch_id` bigint(20) UNSIGNED NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED NOT NULL,
  `opening_amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_opening_investor_bank_balances`
  ADD PRIMARY KEY (`batch_id`,`bank_account_id`),
  ADD KEY `idx_opening_investor_bank_business` (`legal_business_id`,`bank_account_id`);
```

## acct_owner_accounts

Definition: [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql) (line 3)

```sql
CREATE TABLE IF NOT EXISTS acct_owner_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  note VARCHAR(300) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_owner_account_name (legal_business_id, account_name)
);
```

## acct_owner_money

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1387)

```sql
CREATE TABLE `acct_owner_money` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `entry_no` varchar(40) NOT NULL,
  `direction` enum('IN','OUT') NOT NULL,
  `entry_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `account_kind` enum('BANK','CASH') NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payment_method` enum('CASH','UPI','BANK_TRANSFER','CHEQUE') NOT NULL,
  `reference` varchar(80) DEFAULT NULL,
  `note` varchar(300) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_owner_money`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_owner_money_no` (`legal_business_id`,`entry_no`),
  ADD KEY `idx_owner_money_date` (`legal_business_id`,`entry_date`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_owner_money`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql)

```sql
ALTER TABLE acct_owner_money ADD COLUMN IF NOT EXISTS owner_account_id BIGINT UNSIGNED NULL;
```

## acct_party_setoff_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1430)

```sql
CREATE TABLE `acct_party_setoff_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `setoff_id` bigint(20) UNSIGNED NOT NULL,
  `side` enum('SALE','PURCHASE') NOT NULL,
  `doc_id` bigint(20) UNSIGNED NOT NULL,
  `payment_id` bigint(20) UNSIGNED NOT NULL,
  `amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_party_setoff_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_party_setoff_line` (`setoff_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_party_setoff_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_party_setoffs

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1410)

```sql
CREATE TABLE `acct_party_setoffs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `setoff_no` varchar(40) NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `setoff_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `note` varchar(250) DEFAULT NULL,
  `status` enum('RECORDED') NOT NULL DEFAULT 'RECORDED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_party_setoffs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_party_setoff_no` (`legal_business_id`,`setoff_no`),
  ADD KEY `idx_party_setoff_supplier` (`legal_business_id`,`supplier_id`),
  ADD KEY `idx_party_setoff_customer` (`legal_business_id`,`customer_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_party_setoffs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_posting_failures

Definition: [migrations/051_posting_failures.sql](../../migrations/051_posting_failures.sql) (line 3)

```sql
CREATE TABLE IF NOT EXISTS acct_posting_failures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(400) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  first_failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_failed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_posting_failure (legal_business_id, source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_product_categories

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1474)

```sql
CREATE TABLE `acct_product_categories` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `parent_category_id` bigint(20) UNSIGNED DEFAULT NULL,
  `category_code` varchar(30) NOT NULL,
  `category_name` varchar(120) NOT NULL,
  `display_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_category_code` (`legal_business_id`,`division_id`,`category_code`),
  ADD UNIQUE KEY `uq_category_scope` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_category_parent` (`legal_business_id`,`division_id`,`parent_category_id`),
  ADD KEY `fk_category_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_category_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_categories`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_categories`
  ADD CONSTRAINT `fk_category_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_category_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_category_parent` FOREIGN KEY (`legal_business_id`,`division_id`,`parent_category_id`) REFERENCES `acct_product_categories` (`legal_business_id`, `division_id`, `id`);
```

## acct_product_media

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1494)

```sql
CREATE TABLE `acct_product_media` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `media_type` enum('IMAGE','VIDEO') NOT NULL,
  `storage_key` varchar(80) NOT NULL,
  `mime_type` varchar(60) NOT NULL,
  `original_name` varchar(200) DEFAULT NULL,
  `size_bytes` bigint(20) UNSIGNED NOT NULL,
  `caption` varchar(200) DEFAULT NULL,
  `is_cover` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `status` enum('ACTIVE','REMOVED') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_media`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_media_key` (`storage_key`),
  ADD KEY `idx_media_product` (`legal_business_id`,`product_id`,`status`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_media`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_product_variants

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1517)

```sql
CREATE TABLE `acct_product_variants` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `sku` varchar(60) NOT NULL,
  `barcode` varchar(80) DEFAULT NULL,
  `size_label` varchar(40) DEFAULT NULL,
  `color_name` varchar(80) DEFAULT NULL,
  `design_code` varchar(80) DEFAULT NULL,
  `unit_of_measure` enum('PCS','SET','METER') NOT NULL DEFAULT 'PCS',
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `shop_price` decimal(12,2) DEFAULT NULL,
  `low_stock_level` decimal(14,3) DEFAULT NULL,
  `compare_price` decimal(14,2) DEFAULT NULL,
  `photo_media_id` bigint(20) UNSIGNED DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_variants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_variant_sku` (`legal_business_id`,`sku`),
  ADD UNIQUE KEY `uq_variant_scope` (`legal_business_id`,`division_id`,`id`),
  ADD UNIQUE KEY `uq_variant_barcode` (`legal_business_id`,`barcode`),
  ADD KEY `idx_variant_product` (`legal_business_id`,`division_id`,`product_id`),
  ADD KEY `fk_variant_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_variants`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_product_variants`
  ADD CONSTRAINT `fk_variant_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_variant_product` FOREIGN KEY (`legal_business_id`,`division_id`,`product_id`) REFERENCES `acct_products` (`legal_business_id`, `division_id`, `id`);
```

Change: [migrations/059_quantity_prices.sql](../../migrations/059_quantity_prices.sql)

```sql
ALTER TABLE acct_product_variants ADD COLUMN IF NOT EXISTS qty_price_4 DECIMAL(18,2) NULL;
```

Change: [migrations/059_quantity_prices.sql](../../migrations/059_quantity_prices.sql)

```sql
ALTER TABLE acct_product_variants ADD COLUMN IF NOT EXISTS qty_price_10 DECIMAL(18,2) NULL;
```

Change: [migrations/071_serials.sql](../../migrations/071_serials.sql)

```sql
ALTER TABLE acct_product_variants ADD COLUMN IF NOT EXISTS track_serial TINYINT(1) NOT NULL DEFAULT 0;
```

## acct_products

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1445)

```sql
CREATE TABLE `acct_products` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `category_id` bigint(20) UNSIGNED NOT NULL,
  `product_code` varchar(40) NOT NULL,
  `product_name` varchar(180) NOT NULL,
  `brand_name` varchar(120) DEFAULT NULL,
  `fabric` varchar(100) DEFAULT NULL,
  `design_name` varchar(120) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `show_in_shop` tinyint(1) NOT NULL DEFAULT 0,
  `hsn_code` varchar(8) DEFAULT NULL,
  `gst_rate` decimal(5,2) DEFAULT NULL,
  `highlights` text DEFAULT NULL,
  `care_text` text DEFAULT NULL,
  `size_guide` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_product_code` (`legal_business_id`,`division_id`,`product_code`),
  ADD UNIQUE KEY `uq_product_scope` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_product_category` (`legal_business_id`,`division_id`,`category_id`),
  ADD KEY `fk_product_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_product_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_products`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_products`
  ADD CONSTRAINT `fk_product_category` FOREIGN KEY (`legal_business_id`,`division_id`,`category_id`) REFERENCES `acct_product_categories` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_product_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_product_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);
```

## acct_profit_allocations

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1544)

```sql
CREATE TABLE `acct_profit_allocations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `agreement_id` bigint(20) UNSIGNED NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `calculation_basis` decimal(18,2) NOT NULL,
  `applied_percentage` decimal(7,4) NOT NULL,
  `allocated_amount` decimal(18,2) NOT NULL,
  `status` enum('DRAFT','APPROVED','REVERSED') NOT NULL DEFAULT 'DRAFT',
  `calculation_notes` text DEFAULT NULL,
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_profit_allocations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_profit_allocation_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_profit_allocation_approver` (`approved_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_profit_allocations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_profit_allocations`
  ADD CONSTRAINT `fk_profit_allocation_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_profit_allocation_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_profit_allocation_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);
```

## acct_profit_waterfall_policies

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1566)

```sql
CREATE TABLE `acct_profit_waterfall_policies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `allocation_order` enum('BRANCH_FIRST','DIVISION_FIRST','CONTRACT_DEFINED') NOT NULL DEFAULT 'BRANCH_FIRST',
  `shared_expense_method` enum('DIRECT_ONLY','REVENUE_RATIO','MANUAL_ALLOCATION','CONTRACT_DEFINED') NOT NULL DEFAULT 'CONTRACT_DEFINED',
  `loss_carry_forward` tinyint(1) NOT NULL DEFAULT 1,
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `status` enum('DRAFT','APPROVED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `policy_notes` text DEFAULT NULL,
  `evidence_reference` varchar(250) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_profit_waterfall_policies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_waterfall_division` (`division_id`),
  ADD KEY `fk_waterfall_creator` (`created_by`),
  ADD KEY `idx_waterfall_period` (`legal_business_id`,`division_id`,`effective_from`,`effective_to`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_profit_waterfall_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_profit_waterfall_policies`
  ADD CONSTRAINT `fk_waterfall_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_waterfall_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_waterfall_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`);
```

## acct_purchase_headers

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1588)

```sql
CREATE TABLE `acct_purchase_headers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_no` varchar(40) NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_invoice_no` varchar(100) DEFAULT NULL,
  `invoice_date` date NOT NULL,
  `receiving_location_id` bigint(20) UNSIGNED NOT NULL,
  `received_date` date DEFAULT NULL,
  `status` enum('DRAFT','POSTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `remarks` varchar(500) DEFAULT NULL,
  `posted_by` bigint(20) UNSIGNED DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_headers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_purchase_number` (`legal_business_id`,`purchase_no`),
  ADD UNIQUE KEY `uq_purchase_scope` (`legal_business_id`,`division_id`,`id`),
  ADD UNIQUE KEY `uq_purchase_supplier_invoice` (`legal_business_id`,`supplier_id`,`supplier_invoice_no`),
  ADD KEY `idx_purchase_supplier` (`legal_business_id`,`supplier_id`),
  ADD KEY `idx_purchase_location` (`legal_business_id`,`receiving_location_id`),
  ADD KEY `fk_purchase_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_purchase_creator` (`created_by`),
  ADD KEY `fk_purchase_poster` (`posted_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_headers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_headers`
  ADD CONSTRAINT `fk_purchase_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_purchase_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_purchase_location` FOREIGN KEY (`legal_business_id`,`receiving_location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_purchase_poster` FOREIGN KEY (`posted_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_purchase_supplier` FOREIGN KEY (`legal_business_id`,`supplier_id`) REFERENCES `acct_suppliers` (`legal_business_id`, `id`);
```

## acct_purchase_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1613)

```sql
CREATE TABLE `acct_purchase_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_id` bigint(20) UNSIGNED NOT NULL,
  `line_no` int(10) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `line_amount` decimal(18,2) NOT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `hsn_code` varchar(8) DEFAULT NULL,
  `gst_rate` decimal(5,2) DEFAULT NULL,
  `cgst_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `sgst_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `igst_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `itc_eligible` tinyint(1) NOT NULL DEFAULT 1
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_purchase_line_no` (`purchase_id`,`line_no`),
  ADD UNIQUE KEY `uq_purchase_line_scope` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_purchase_line_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_purchase_line_header` (`legal_business_id`,`division_id`,`purchase_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_lines`
  ADD CONSTRAINT `fk_purchase_line_header` FOREIGN KEY (`legal_business_id`,`division_id`,`purchase_id`) REFERENCES `acct_purchase_headers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_purchase_line_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);
```

Change: [migrations/070_lots.sql](../../migrations/070_lots.sql)

```sql
ALTER TABLE acct_purchase_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(60) NULL;
```

## acct_purchase_order_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1660)

```sql
CREATE TABLE `acct_purchase_order_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED NOT NULL,
  `line_no` int(10) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `line_amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_order_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_purchase_order_line` (`order_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_order_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_purchase_orders

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1638)

```sql
CREATE TABLE `acct_purchase_orders` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `order_no` varchar(40) NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `order_date` date NOT NULL,
  `expected_date` date DEFAULT NULL,
  `status` enum('OPEN','RECEIVED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  `purchase_id` bigint(20) UNSIGNED DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_purchase_order_no` (`legal_business_id`,`order_no`),
  ADD KEY `idx_purchase_order_status` (`legal_business_id`,`division_id`,`status`),
  ADD KEY `idx_purchase_order_supplier` (`legal_business_id`,`supplier_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_orders`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_purchase_payments

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1676)

```sql
CREATE TABLE `acct_purchase_payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_id` bigint(20) UNSIGNED NOT NULL,
  `payment_no` varchar(40) NOT NULL,
  `payment_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` enum('BANK_TRANSFER','UPI','CASH','CHEQUE','OTHER','SET_OFF') NOT NULL,
  `payment_source` enum('BUSINESS_BANK','BUSINESS_CASH','INVESTOR_BANK','INVESTOR_CASH','OWNER_PERSONAL') NOT NULL,
  `funding_treatment` enum('NONE','AGREEMENT','TEMPORARY_ADVANCE','OWNER_REIMBURSEMENT') NOT NULL DEFAULT 'NONE',
  `source_bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `source_cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `funding_party_id` bigint(20) UNSIGNED DEFAULT NULL,
  `funding_agreement_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payer_name` varchar(160) DEFAULT NULL,
  `payment_reference` varchar(120) DEFAULT NULL,
  `evidence_reference` varchar(255) DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `cutover_treatment` enum('UNREVIEWED','PRE_CUTOVER','POST_CUTOVER') NOT NULL DEFAULT 'UNREVIEWED',
  `status` enum('DRAFT','VERIFIED','VOID') NOT NULL DEFAULT 'DRAFT',
  `journal_entry_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `verified_by` bigint(20) UNSIGNED DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_purchase_payment_no` (`legal_business_id`,`payment_no`),
  ADD UNIQUE KEY `uq_purchase_payment_scope` (`legal_business_id`,`id`),
  ADD KEY `idx_purchase_payment_purchase` (`legal_business_id`,`division_id`,`purchase_id`),
  ADD KEY `idx_purchase_payment_date` (`legal_business_id`,`payment_date`),
  ADD KEY `idx_purchase_payment_funding` (`legal_business_id`,`funding_party_id`,`funding_agreement_id`),
  ADD KEY `fk_pp_source_bank` (`source_bank_account_id`),
  ADD KEY `fk_pp_source_cash` (`source_cash_account_id`),
  ADD KEY `fk_pp_funding_party` (`funding_party_id`),
  ADD KEY `fk_pp_funding_agreement` (`legal_business_id`,`funding_agreement_id`),
  ADD KEY `fk_pp_journal` (`journal_entry_id`),
  ADD KEY `fk_pp_creator` (`created_by`),
  ADD KEY `fk_pp_verifier` (`verified_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_purchase_payments`
  ADD CONSTRAINT `fk_pp_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_pp_funding_agreement` FOREIGN KEY (`legal_business_id`,`funding_agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_pp_funding_party` FOREIGN KEY (`funding_party_id`) REFERENCES `acct_funding_parties` (`id`),
  ADD CONSTRAINT `fk_pp_journal` FOREIGN KEY (`journal_entry_id`) REFERENCES `acct_journal_entries` (`id`),
  ADD CONSTRAINT `fk_pp_purchase` FOREIGN KEY (`legal_business_id`,`division_id`,`purchase_id`) REFERENCES `acct_purchase_headers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_pp_source_bank` FOREIGN KEY (`source_bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_pp_source_cash` FOREIGN KEY (`source_cash_account_id`) REFERENCES `acct_cash_accounts` (`id`),
  ADD CONSTRAINT `fk_pp_verifier` FOREIGN KEY (`verified_by`) REFERENCES `acct_app_users` (`id`);
```

Change: [migrations/075_supplier_payment_batches.sql](../../migrations/075_supplier_payment_batches.sql)

```sql
ALTER TABLE acct_purchase_payments ADD COLUMN IF NOT EXISTS batch_no VARCHAR(40) NULL;
```

Change: [migrations/075_supplier_payment_batches.sql](../../migrations/075_supplier_payment_batches.sql)

```sql
ALTER TABLE acct_purchase_payments ADD INDEX IF NOT EXISTS idx_pp_batch (legal_business_id, batch_no);
```

Change: [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql)

```sql
ALTER TABLE acct_purchase_payments ADD COLUMN IF NOT EXISTS owner_account_id BIGINT UNSIGNED NULL;
```

## acct_reel_tracks

Definition: [migrations/073_reel_tracks.sql](../../migrations/073_reel_tracks.sql) (line 3)

```sql
CREATE TABLE IF NOT EXISTS acct_reel_tracks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  track_name VARCHAR(120) NOT NULL,
  storage_key VARCHAR(80) NOT NULL,
  mime_type VARCHAR(60) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reel_tracks (legal_business_id, status)
);
```

## acct_salary_payments

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1710)

```sql
CREATE TABLE `acct_salary_payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `salary_month` char(7) NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `note` varchar(300) DEFAULT NULL,
  `expense_id` bigint(20) UNSIGNED NOT NULL,
  `paid_on` date NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `advance_deducted` decimal(18,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_salary_payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_salary_employee_month` (`legal_business_id`,`employee_id`,`salary_month`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_salary_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_sale_rewards

Definition: [migrations/063_rewards.sql](../../migrations/063_rewards.sql) (line 23)

```sql
CREATE TABLE IF NOT EXISTS acct_sale_rewards (
  sale_id BIGINT UNSIGNED NOT NULL,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  points_used INT UNSIGNED NOT NULL DEFAULT 0,
  points_discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  coupon_id BIGINT UNSIGNED NULL,
  coupon_discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sale_id),
  KEY idx_reward_customer (legal_business_id, customer_id),
  KEY idx_reward_coupon (legal_business_id, coupon_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_sales_headers

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1730)

```sql
CREATE TABLE `acct_sales_headers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `invoice_no` varchar(60) NOT NULL,
  `invoice_date` date NOT NULL,
  `customer_name` varchar(150) DEFAULT NULL,
  `customer_phone` varchar(20) DEFAULT NULL,
  `status` enum('DRAFT','POSTED','VOID') NOT NULL DEFAULT 'DRAFT',
  `subtotal` decimal(18,2) NOT NULL DEFAULT 0.00,
  `discount_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `grand_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `remarks` varchar(500) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `posted_by` bigint(20) UNSIGNED DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `customer_id` bigint(20) UNSIGNED DEFAULT NULL,
  `gst_applied` tinyint(1) NOT NULL DEFAULT 0,
  `place_of_supply` varchar(60) DEFAULT NULL,
  `submit_token` char(36) DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_headers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_sales_invoice` (`legal_business_id`,`invoice_no`),
  ADD UNIQUE KEY `uq_sales_scope` (`legal_business_id`,`division_id`,`id`),
  ADD UNIQUE KEY `uq_sales_submit_token` (`legal_business_id`,`submit_token`),
  ADD KEY `idx_sales_branch_date` (`legal_business_id`,`division_id`,`branch_id`,`invoice_date`),
  ADD KEY `fk_sales_location` (`legal_business_id`,`location_id`),
  ADD KEY `fk_sales_creator` (`created_by`),
  ADD KEY `fk_sales_poster` (`posted_by`),
  ADD KEY `idx_sales_customer` (`legal_business_id`,`customer_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_headers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_headers`
  ADD CONSTRAINT `fk_sales_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_sales_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_sales_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_sales_location` FOREIGN KEY (`legal_business_id`,`location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_sales_poster` FOREIGN KEY (`posted_by`) REFERENCES `acct_app_users` (`id`);
```

Change: [migrations/042_sale_delivery_charge.sql](../../migrations/042_sale_delivery_charge.sql)

```sql
ALTER TABLE acct_sales_headers
  ADD COLUMN IF NOT EXISTS shipping_charge DECIMAL(18,2) NOT NULL DEFAULT 0.00;
```

Change: [migrations/048_estimates_address.sql](../../migrations/048_estimates_address.sql)

```sql
ALTER TABLE acct_sales_headers
  ADD COLUMN IF NOT EXISTS customer_address VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS is_estimate TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimate_no VARCHAR(40) NULL;
```

Change: [migrations/066_bill_terms.sql](../../migrations/066_bill_terms.sql)

```sql
ALTER TABLE acct_sales_headers ADD COLUMN IF NOT EXISTS terms_text TEXT NULL;
```

## acct_sales_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1761)

```sql
CREATE TABLE `acct_sales_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `sale_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `minimum_selling_price` decimal(18,2) DEFAULT NULL,
  `discount_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `line_total` decimal(18,2) NOT NULL,
  `price_override_reason` varchar(300) DEFAULT NULL,
  `unit_cost` decimal(18,4) DEFAULT NULL,
  `total_cost` decimal(18,2) DEFAULT NULL,
  `hsn_code` varchar(8) DEFAULT NULL,
  `gst_rate` decimal(5,2) DEFAULT NULL,
  `taxable_value` decimal(14,2) DEFAULT NULL,
  `cgst_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `sgst_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `igst_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `cess_amount` decimal(14,2) NOT NULL DEFAULT 0.00
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_lines_sale` (`sale_id`),
  ADD KEY `idx_sales_lines_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_sales_line_header` (`legal_business_id`,`division_id`,`sale_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_lines`
  ADD CONSTRAINT `fk_sales_line_header` FOREIGN KEY (`legal_business_id`,`division_id`,`sale_id`) REFERENCES `acct_sales_headers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_sales_line_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);
```

Change: [migrations/070_lots.sql](../../migrations/070_lots.sql)

```sql
ALTER TABLE acct_sales_lines ADD COLUMN IF NOT EXISTS lot_no VARCHAR(60) NULL;
```

## acct_sales_payments

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1790)

```sql
CREATE TABLE `acct_sales_payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `sale_id` bigint(20) UNSIGNED NOT NULL,
  `payment_date` date NOT NULL,
  `payment_account_type` enum('BANK','CASH','CARD','UPI','OTHERS') DEFAULT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payment_account` enum('ABHIRAM_GROUP','INVESTMENT_BANKING','CASH') DEFAULT NULL,
  `payment_method` enum('CASH','UPI','BANK_TRANSFER','CARD','OTHER','DISCOUNT','SET_OFF') NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_reference` varchar(150) DEFAULT NULL,
  `remarks` varchar(300) DEFAULT NULL,
  `status` enum('RECORDED','VOID') NOT NULL DEFAULT 'RECORDED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_payment_sale` (`legal_business_id`,`division_id`,`sale_id`),
  ADD KEY `fk_sales_payment_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_payments`
  ADD CONSTRAINT `fk_sales_payment_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_sales_payment_header` FOREIGN KEY (`legal_business_id`,`division_id`,`sale_id`) REFERENCES `acct_sales_headers` (`legal_business_id`, `division_id`, `id`);
```

Change: [migrations/044_exchange.sql](../../migrations/044_exchange.sql)

```sql
ALTER TABLE acct_sales_payments
  MODIFY COLUMN payment_method ENUM('CASH','UPI','BANK_TRANSFER','CARD','OTHER','DISCOUNT','SET_OFF','EXCHANGE') NOT NULL;
```

Change: [migrations/044_exchange.sql](../../migrations/044_exchange.sql)

```sql
ALTER TABLE acct_sales_payments
  ADD COLUMN IF NOT EXISTS exchange_return_id BIGINT UNSIGNED DEFAULT NULL;
```

Change: [migrations/050_exchange_index.sql](../../migrations/050_exchange_index.sql)

```sql
ALTER TABLE acct_sales_payments
  ADD INDEX IF NOT EXISTS idx_sales_payments_exchange_return (exchange_return_id);
```

## acct_sales_refunds

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1815)

```sql
CREATE TABLE `acct_sales_refunds` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `return_id` bigint(20) UNSIGNED NOT NULL,
  `refund_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` enum('CASH','UPI','BANK_TRANSFER','CARD','OTHER') NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `remarks` varchar(300) DEFAULT NULL,
  `status` enum('RECORDED','VOID') NOT NULL DEFAULT 'RECORDED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_refunds`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_refund_return` (`legal_business_id`,`return_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_refunds`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_sales_return_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1861)

```sql
CREATE TABLE `acct_sales_return_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `return_id` bigint(20) UNSIGNED NOT NULL,
  `sale_line_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `gross_value` decimal(18,2) NOT NULL,
  `refund_value` decimal(18,2) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `total_cost` decimal(18,2) NOT NULL,
  `item_condition` enum('RESELLABLE','DAMAGED') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_return_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_return_lines_return` (`return_id`),
  ADD KEY `idx_return_lines_sale_line` (`legal_business_id`,`sale_line_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_return_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_sales_returns

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1837)

```sql
CREATE TABLE `acct_sales_returns` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `sale_id` bigint(20) UNSIGNED NOT NULL,
  `return_no` varchar(60) NOT NULL,
  `return_date` date NOT NULL,
  `reason` enum('DEFECTIVE','WRONG_SIZE','CUSTOMER_CHANGED_MIND','OTHER') NOT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `gross_value` decimal(18,2) NOT NULL,
  `refund_value` decimal(18,2) NOT NULL,
  `status` enum('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_returns`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_sales_return_no` (`legal_business_id`,`return_no`),
  ADD KEY `idx_sales_return_sale` (`legal_business_id`,`sale_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sales_returns`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/053_return_delivery_refund.sql](../../migrations/053_return_delivery_refund.sql)

```sql
ALTER TABLE acct_sales_returns
  ADD COLUMN IF NOT EXISTS delivery_value DECIMAL(18,2) NOT NULL DEFAULT 0.00;
```

## acct_scenario_assumptions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1881)

```sql
CREATE TABLE `acct_scenario_assumptions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `scenario_id` bigint(20) UNSIGNED NOT NULL,
  `metric_code` varchar(60) NOT NULL,
  `period_month` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `reason` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_scenario_assumptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_scenario_period` (`scenario_id`,`period_month`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_scenario_assumptions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_scenario_assumptions`
  ADD CONSTRAINT `acct_scenario_assumptions_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `acct_financial_scenarios` (`id`);
```

## acct_selling_prices

Definition: [migrations/060_selling_prices.sql](../../migrations/060_selling_prices.sql) (line 3)

```sql
CREATE TABLE IF NOT EXISTS acct_selling_prices (
  legal_business_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  min_price DECIMAL(18,2) NULL,
  max_price DECIMAL(18,2) NULL,
  suggested_price DECIMAL(18,2) NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (legal_business_id, variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_serials

Definition: [migrations/071_serials.sql](../../migrations/071_serials.sql) (line 4)

```sql
CREATE TABLE IF NOT EXISTS acct_serials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  serial_no VARCHAR(30) NOT NULL,
  status ENUM('IN_STOCK','SOLD') NOT NULL DEFAULT 'IN_STOCK',
  sale_id BIGINT UNSIGNED NULL,
  sold_on DATE NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_serial_no (legal_business_id, serial_no),
  KEY idx_serial_variant (legal_business_id, variant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_sessions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1897)

```sql
CREATE TABLE `acct_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_acct_session_token` (`token_hash`),
  ADD KEY `idx_acct_session_user` (`user_id`),
  ADD KEY `idx_acct_session_expiry` (`expires_at`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sessions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_sessions`
  ADD CONSTRAINT `fk_acct_session_user` FOREIGN KEY (`user_id`) REFERENCES `acct_app_users` (`id`) ON DELETE CASCADE;
```

## acct_shop_customers

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1911)

```sql
CREATE TABLE `acct_shop_customers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `email` varchar(160) NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `phone` varchar(30) NOT NULL,
  `password_hash` varchar(100) NOT NULL,
  `status` enum('ACTIVE','BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_login_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_shop_customer_email` (`legal_business_id`,`email`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_customers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/041_shop_email_verification.sql](../../migrations/041_shop_email_verification.sql)

```sql
ALTER TABLE acct_shop_customers
  ADD COLUMN IF NOT EXISTS email_verified_at DATETIME DEFAULT NULL;
```

## acct_shop_email_verifications

Definition: [migrations/041_shop_email_verification.sql](../../migrations/041_shop_email_verification.sql) (line 10)

```sql
CREATE TABLE IF NOT EXISTS acct_shop_email_verifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_verify_token (token_hash),
  KEY idx_shop_verify_customer (customer_id),
  CONSTRAINT fk_shop_verify_customer FOREIGN KEY (customer_id) REFERENCES acct_shop_customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_shop_password_resets

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1929)

```sql
CREATE TABLE `acct_shop_password_resets` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_password_resets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_shop_reset_token` (`token_hash`),
  ADD KEY `idx_shop_reset_customer` (`customer_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_password_resets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_password_resets`
  ADD CONSTRAINT `fk_shop_reset_customer` FOREIGN KEY (`customer_id`) REFERENCES `acct_shop_customers` (`id`) ON DELETE CASCADE;
```

## acct_shop_sessions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1944)

```sql
CREATE TABLE `acct_shop_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_shop_session_token` (`token_hash`),
  ADD KEY `idx_shop_session_customer` (`customer_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_sessions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_shop_sessions`
  ADD CONSTRAINT `fk_shop_session_customer` FOREIGN KEY (`customer_id`) REFERENCES `acct_shop_customers` (`id`) ON DELETE CASCADE;
```

## acct_staff_advance_recoveries

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1981)

```sql
CREATE TABLE `acct_staff_advance_recoveries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `advance_id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `expense_payment_id` bigint(20) UNSIGNED NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `recovered_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_staff_advance_recoveries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_staff_recovery_advance` (`advance_id`),
  ADD KEY `idx_staff_recovery_employee` (`employee_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_staff_advance_recoveries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_staff_advances

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1958)

```sql
CREATE TABLE `acct_staff_advances` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `advance_no` varchar(40) NOT NULL,
  `given_on` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `paid_from` enum('CASH','BANK') NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payment_method` enum('CASH','UPI','BANK_TRANSFER','CHEQUE') NOT NULL,
  `instalment` decimal(18,2) DEFAULT NULL,
  `note` varchar(300) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_staff_advances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_staff_advance_no` (`legal_business_id`,`advance_no`),
  ADD KEY `idx_staff_advance_employee` (`legal_business_id`,`employee_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_staff_advances`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_stock_count_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2017)

```sql
CREATE TABLE `acct_stock_count_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `count_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `books_qty` decimal(14,3) NOT NULL,
  `counted_qty` decimal(14,3) NOT NULL,
  `difference` decimal(14,3) NOT NULL,
  `written_off` tinyint(1) NOT NULL DEFAULT 0,
  `damage_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_count_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_count_line` (`count_id`,`variant_id`),
  ADD KEY `idx_count_line_count` (`legal_business_id`,`count_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_count_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [migrations/043_stock_finds.sql](../../migrations/043_stock_finds.sql)

```sql
ALTER TABLE acct_stock_count_lines
  ADD COLUMN IF NOT EXISTS found TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS find_id BIGINT UNSIGNED DEFAULT NULL;
```

## acct_stock_counts

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 1996)

```sql
CREATE TABLE `acct_stock_counts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `count_no` varchar(60) NOT NULL,
  `count_date` date NOT NULL,
  `note` varchar(300) DEFAULT NULL,
  `status` enum('COUNTED','SETTLED') NOT NULL DEFAULT 'COUNTED',
  `counted_by` bigint(20) UNSIGNED NOT NULL,
  `settled_by` bigint(20) UNSIGNED DEFAULT NULL,
  `settled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_counts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_count_no` (`legal_business_id`,`count_no`),
  ADD KEY `idx_stock_count_location` (`legal_business_id`,`location_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_counts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_stock_damages

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2035)

```sql
CREATE TABLE `acct_stock_damages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `damage_date` date NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `total_cost` decimal(18,2) NOT NULL,
  `reason` enum('DAMAGED','LOST','OTHER') NOT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `status` enum('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_damages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_stock_damage_variant` (`legal_business_id`,`location_id`,`variant_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_damages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_stock_drafts

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2059)

```sql
CREATE TABLE `acct_stock_drafts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `source` enum('WHATSAPP','PASTED') NOT NULL,
  `wa_message_id` varchar(120) DEFAULT NULL,
  `reporter_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reporter_name` varchar(150) DEFAULT NULL,
  `location_id` bigint(20) UNSIGNED DEFAULT NULL,
  `raw_line` varchar(500) NOT NULL,
  `action` enum('RECEIVED','DAMAGED','LOST','COUNT','SOLD') DEFAULT NULL,
  `variant_id` bigint(20) UNSIGNED DEFAULT NULL,
  `quantity` decimal(18,3) DEFAULT NULL,
  `price` decimal(18,2) DEFAULT NULL,
  `note` varchar(300) DEFAULT NULL,
  `problem` varchar(300) DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','DONE') NOT NULL DEFAULT 'PENDING',
  `decided_by` bigint(20) UNSIGNED DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `result_note` varchar(300) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_drafts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_draft_wa` (`legal_business_id`,`wa_message_id`,`raw_line`(100)),
  ADD KEY `idx_stock_draft_status` (`legal_business_id`,`status`,`created_at`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_drafts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_stock_events

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2088)

```sql
CREATE TABLE `acct_stock_events` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `event_type` enum('NEW_STOCK') NOT NULL DEFAULT 'NEW_STOCK',
  `source_type` varchar(30) NOT NULL,
  `source_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED DEFAULT NULL,
  `quantity` decimal(18,3) NOT NULL,
  `status` enum('NEW','SHARED','DISMISSED') NOT NULL DEFAULT 'NEW',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `shared_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_events`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_event` (`legal_business_id`,`source_type`,`source_id`,`variant_id`),
  ADD KEY `idx_stock_event_status` (`legal_business_id`,`status`,`created_at`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_stock_finds

Definition: [migrations/043_stock_finds.sql](../../migrations/043_stock_finds.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_stock_finds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  variant_id BIGINT UNSIGNED NOT NULL,
  find_date DATE NOT NULL,
  quantity DECIMAL(14,3) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  total_cost DECIMAL(18,2) NOT NULL,
  remarks VARCHAR(500) DEFAULT NULL,
  status ENUM('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_finds_business (legal_business_id, find_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## acct_stock_movements

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2110)

```sql
CREATE TABLE `acct_stock_movements` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `movement_date` date NOT NULL,
  `movement_type` enum('PURCHASE_RECEIPT','TRANSFER_OUT','TRANSFER_IN','SALE','SALES_RETURN','PURCHASE_RETURN','ADJUSTMENT_IN','ADJUSTMENT_OUT') NOT NULL,
  `source_type` varchar(40) NOT NULL,
  `source_id` bigint(20) UNSIGNED NOT NULL,
  `source_line_id` bigint(20) UNSIGNED NOT NULL,
  `quantity_change` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `total_cost` decimal(18,2) NOT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_movements`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_source_line_movement` (`legal_business_id`,`movement_type`,`source_type`,`source_line_id`),
  ADD KEY `idx_stock_location_variant` (`legal_business_id`,`location_id`,`variant_id`),
  ADD KEY `idx_stock_movement_date` (`legal_business_id`,`movement_date`),
  ADD KEY `idx_stock_source` (`legal_business_id`,`source_type`,`source_id`),
  ADD KEY `fk_stock_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_stock_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_movements`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_movements`
  ADD CONSTRAINT `fk_stock_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_stock_location` FOREIGN KEY (`legal_business_id`,`location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_stock_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);
```

Change: [migrations/052_stock_movement_key.sql](../../migrations/052_stock_movement_key.sql)

```sql
ALTER TABLE acct_stock_movements
  DROP INDEX IF EXISTS uq_stock_source_line_movement,
  DROP INDEX IF EXISTS uq_stock_source_line_v2,
  ADD UNIQUE INDEX uq_stock_source_line_v2 (legal_business_id, movement_type, source_type, source_id, source_line_id);
```

## acct_stock_reporters

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2135)

```sql
CREATE TABLE `acct_stock_reporters` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `status` enum('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_reporters`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_reporter_phone` (`legal_business_id`,`phone`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_reporters`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_stock_transfer_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2176)

```sql
CREATE TABLE `acct_stock_transfer_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `transfer_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `min_selling_price` decimal(18,2) NOT NULL,
  `max_selling_price` decimal(18,2) DEFAULT NULL,
  `suggested_selling_price` decimal(18,2) DEFAULT NULL,
  `dispatched_unit_cost` decimal(18,4) DEFAULT NULL,
  `remarks` varchar(500) DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_transfer_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_transfer_variant` (`transfer_id`,`variant_id`),
  ADD KEY `idx_transfer_line_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_transfer_line_header` (`legal_business_id`,`division_id`,`transfer_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_transfer_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_transfer_lines`
  ADD CONSTRAINT `fk_transfer_line_header` FOREIGN KEY (`legal_business_id`,`division_id`,`transfer_id`) REFERENCES `acct_stock_transfers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_transfer_line_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);
```

## acct_stock_transfers

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2152)

```sql
CREATE TABLE `acct_stock_transfers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `transfer_no` varchar(60) NOT NULL,
  `from_location_id` bigint(20) UNSIGNED NOT NULL,
  `to_location_id` bigint(20) UNSIGNED NOT NULL,
  `transfer_date` date NOT NULL,
  `status` enum('DRAFT','DISPATCHED','RECEIVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `remarks` varchar(500) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `dispatched_by` bigint(20) UNSIGNED DEFAULT NULL,
  `dispatched_at` datetime DEFAULT NULL,
  `received_by` bigint(20) UNSIGNED DEFAULT NULL,
  `received_at` datetime DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_transfers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_transfer_no` (`legal_business_id`,`transfer_no`),
  ADD UNIQUE KEY `uq_transfer_scope` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_transfer_from` (`legal_business_id`,`from_location_id`),
  ADD KEY `idx_transfer_to` (`legal_business_id`,`to_location_id`),
  ADD KEY `idx_transfer_status` (`legal_business_id`,`status`,`transfer_date`),
  ADD KEY `fk_transfer_created_by` (`created_by`),
  ADD KEY `fk_transfer_dispatched_by` (`dispatched_by`),
  ADD KEY `fk_transfer_received_by` (`received_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_transfers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_stock_transfers`
  ADD CONSTRAINT `fk_transfer_created_by` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_transfer_dispatched_by` FOREIGN KEY (`dispatched_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_transfer_from_location` FOREIGN KEY (`legal_business_id`,`from_location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_transfer_received_by` FOREIGN KEY (`received_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_transfer_to_location` FOREIGN KEY (`legal_business_id`,`to_location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`);
```

## acct_supplier_refunds

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2227)

```sql
CREATE TABLE `acct_supplier_refunds` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `return_id` bigint(20) UNSIGNED DEFAULT NULL,
  `refund_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` enum('CASH','UPI','BANK_TRANSFER','CARD','OTHER') NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `cash_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `remarks` varchar(300) DEFAULT NULL,
  `status` enum('RECORDED','VOID') NOT NULL DEFAULT 'RECORDED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_refunds`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_supplier_refund_supplier` (`legal_business_id`,`supplier_id`),
  ADD KEY `idx_supplier_refund_return` (`legal_business_id`,`return_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_refunds`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_supplier_return_lines

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2275)

```sql
CREATE TABLE `acct_supplier_return_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `return_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_line_id` bigint(20) UNSIGNED DEFAULT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `total_cost` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_return_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_supplier_return_lines_return` (`return_id`),
  ADD KEY `idx_supplier_return_lines_pline` (`legal_business_id`,`purchase_line_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_return_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_supplier_return_replacements

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2292)

```sql
CREATE TABLE `acct_supplier_return_replacements` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `return_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_id` bigint(20) UNSIGNED NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_return_replacements`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_return_replacement` (`legal_business_id`,`return_id`,`purchase_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_return_replacements`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_supplier_returns

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2250)

```sql
CREATE TABLE `acct_supplier_returns` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_id` bigint(20) UNSIGNED DEFAULT NULL,
  `location_id` bigint(20) UNSIGNED NOT NULL,
  `return_no` varchar(60) NOT NULL,
  `return_date` date NOT NULL,
  `reason` enum('DAMAGED','WRONG_ITEM','EXTRA','OTHER') NOT NULL,
  `remarks` varchar(500) DEFAULT NULL,
  `supplier_note_no` varchar(100) DEFAULT NULL,
  `cost_value` decimal(18,2) NOT NULL,
  `agreed_value` decimal(18,2) NOT NULL,
  `status` enum('POSTED','VOID') NOT NULL DEFAULT 'POSTED',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_returns`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_supplier_return_no` (`legal_business_id`,`return_no`),
  ADD KEY `idx_supplier_return_supplier` (`legal_business_id`,`supplier_id`),
  ADD KEY `idx_supplier_return_purchase` (`legal_business_id`,`purchase_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_supplier_returns`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

## acct_suppliers

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2196)

```sql
CREATE TABLE `acct_suppliers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `supplier_code` varchar(30) NOT NULL,
  `supplier_name` varchar(180) NOT NULL,
  `supplier_type` enum('MANUFACTURER','WHOLESALER','WEAVER','DISTRIBUTOR','OTHER') NOT NULL DEFAULT 'OTHER',
  `contact_person` varchar(150) DEFAULT NULL,
  `mobile` varchar(20) DEFAULT NULL,
  `whatsapp_number` varchar(20) DEFAULT NULL,
  `email` varchar(190) DEFAULT NULL,
  `address` varchar(500) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state_name` varchar(100) DEFAULT NULL,
  `postal_code` varchar(12) DEFAULT NULL,
  `gstin` varchar(15) DEFAULT NULL,
  `payment_terms` enum('ADVANCE','CASH','CREDIT') NOT NULL DEFAULT 'CASH',
  `credit_days` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `notes` varchar(1000) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `linked_customer_id` bigint(20) UNSIGNED DEFAULT NULL
) ;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_suppliers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_supplier_code` (`legal_business_id`,`supplier_code`),
  ADD UNIQUE KEY `uq_supplier_scope` (`legal_business_id`,`id`),
  ADD KEY `idx_supplier_name` (`legal_business_id`,`supplier_name`),
  ADD KEY `fk_supplier_creator` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_suppliers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_suppliers`
  ADD CONSTRAINT `fk_supplier_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_supplier_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_user_access

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2307)

```sql
CREATE TABLE `acct_user_access` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `role` enum('GROUP_OWNER','ACCOUNTANT','DIVISION_MANAGER','CASHIER','INVESTOR','LENDER','AUDITOR') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `scope_division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `party_id` bigint(20) UNSIGNED DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_user_access`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_access` (`user_id`,`legal_business_id`,`division_id`,`role`),
  ADD KEY `legal_business_id` (`legal_business_id`),
  ADD KEY `division_id` (`division_id`,`legal_business_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_user_access`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_user_access`
  ADD CONSTRAINT `acct_user_access_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `acct_user_access_ibfk_2` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_user_access_ibfk_3` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);
```

## acct_user_backup_codes

Definition: [migrations/065_two_step_login.sql](../../migrations/065_two_step_login.sql) (line 10)

```sql
CREATE TABLE IF NOT EXISTS acct_user_backup_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL,
  KEY idx_backup_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_user_totp

Definition: [migrations/065_two_step_login.sql](../../migrations/065_two_step_login.sql) (line 2)

```sql
CREATE TABLE IF NOT EXISTS acct_user_totp (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  secret VARCHAR(64) NOT NULL,
  enabled_at DATETIME NULL,
  last_step BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_vouchers

Definition: [migrations/056_vouchers.sql](../../migrations/056_vouchers.sql) (line 4)

```sql
CREATE TABLE IF NOT EXISTS acct_vouchers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  voucher_no VARCHAR(40) NOT NULL,
  voucher_type ENUM('CPV','BPV','OPV','IPV') NOT NULL,
  financial_year VARCHAR(8) NOT NULL,
  seq INT UNSIGNED NOT NULL,
  expense_payment_id BIGINT UNSIGNED NOT NULL,
  issued_by BIGINT UNSIGNED NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_voucher_payment (legal_business_id, expense_payment_id),
  UNIQUE KEY uq_voucher_no (legal_business_id, voucher_no),
  UNIQUE KEY uq_voucher_seq (legal_business_id, voucher_type, financial_year, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## acct_wa_broadcast_recipients

Definition: [migrations/074_wa_broadcasts.sql](../../migrations/074_wa_broadcasts.sql) (line 20)

```sql
CREATE TABLE IF NOT EXISTS acct_wa_broadcast_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  broadcast_id BIGINT UNSIGNED NOT NULL,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'QUEUED',
  wa_message_id VARCHAR(100) NULL,
  error_code INT NULL,
  error_reason VARCHAR(300) NULL,
  sent_at DATETIME NULL,
  UNIQUE KEY uq_wa_bc_cust (broadcast_id, customer_id),
  KEY idx_wa_rcpt_status (broadcast_id, status),
  KEY idx_wa_rcpt_msg (wa_message_id),
  KEY idx_wa_rcpt_cust (legal_business_id, customer_id, event_key),
  KEY idx_wa_rcpt_sent (legal_business_id, sent_at)
);
```

## acct_wa_broadcasts

Definition: [migrations/074_wa_broadcasts.sql](../../migrations/074_wa_broadcasts.sql) (line 3)

```sql
CREATE TABLE IF NOT EXISTS acct_wa_broadcasts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'NEW_STOCK',
  product_id BIGINT UNSIGNED NOT NULL,
  event_ids VARCHAR(500) NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  language_code VARCHAR(12) NOT NULL,
  image_media_id BIGINT UNSIGNED NOT NULL,
  product_label VARCHAR(200) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'SENDING',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wa_bc (legal_business_id, created_at)
);
```

## acct_wa_delivery

Definition: [migrations/074_wa_broadcasts.sql](../../migrations/074_wa_broadcasts.sql) (line 40)

```sql
CREATE TABLE IF NOT EXISTS acct_wa_delivery (
  wa_message_id VARCHAR(100) NOT NULL PRIMARY KEY,
  status VARCHAR(12) NOT NULL,
  error_code INT NULL,
  error_reason VARCHAR(300) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## acct_wa_status_log

Definition: [migrations/077_wa_status_log.sql](../../migrations/077_wa_status_log.sql) (line 3)

```sql
CREATE TABLE IF NOT EXISTS acct_wa_status_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  wa_message_id VARCHAR(100) NOT NULL,
  status VARCHAR(12) NOT NULL,
  error_code INT NULL,
  error_reason VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wa_status_msg (wa_message_id)
);
```

## acct_whatsapp_outbox

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2324)

```sql
CREATE TABLE `acct_whatsapp_outbox` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `subscription_id` bigint(20) UNSIGNED NOT NULL,
  `recipient_id` bigint(20) UNSIGNED NOT NULL,
  `report_type` varchar(30) NOT NULL,
  `period_key` varchar(40) NOT NULL,
  `status` enum('PENDING','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  `attempts` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `provider_message_id` varchar(120) DEFAULT NULL,
  `error_text` varchar(500) DEFAULT NULL,
  `headline_json` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sent_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_outbox`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_wa_outbox_period` (`subscription_id`,`period_key`),
  ADD KEY `idx_wa_outbox_created` (`legal_business_id`,`created_at`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_outbox`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_outbox`
  ADD CONSTRAINT `fk_wa_outbox_sub` FOREIGN KEY (`subscription_id`) REFERENCES `acct_whatsapp_subscriptions` (`id`) ON DELETE CASCADE;
```

## acct_whatsapp_recipients

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2346)

```sql
CREATE TABLE `acct_whatsapp_recipients` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `full_name` varchar(160) NOT NULL,
  `phone_e164` varchar(16) NOT NULL,
  `investor_party_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `notes` varchar(300) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_recipients`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_whatsapp_phone` (`legal_business_id`,`phone_e164`),
  ADD KEY `fk_wa_recipient_user` (`created_by`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_recipients`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_recipients`
  ADD CONSTRAINT `fk_wa_recipient_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_wa_recipient_user` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);
```

## acct_whatsapp_subscriptions

Definition: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql) (line 2364)

```sql
CREATE TABLE `acct_whatsapp_subscriptions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `recipient_id` bigint(20) UNSIGNED NOT NULL,
  `report_type` enum('DAILY_SALES','DAILY_FULL','STOCK_DAILY','STOCK_MONTHLY','ALERTS','INVESTOR_STATEMENT') NOT NULL,
  `division_id` bigint(20) UNSIGNED DEFAULT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` enum('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_wa_sub_recipient` (`recipient_id`);
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_subscriptions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;
```

Change: [db/base_schema_2026-10-28.sql](../../db/base_schema_2026-10-28.sql)

```sql
ALTER TABLE `acct_whatsapp_subscriptions`
  ADD CONSTRAINT `fk_wa_sub_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `acct_whatsapp_recipients` (`id`) ON DELETE CASCADE;
```

Change: [migrations/045_morning_digest.sql](../../migrations/045_morning_digest.sql)

```sql
ALTER TABLE acct_whatsapp_subscriptions
  MODIFY COLUMN report_type ENUM('DAILY_SALES','DAILY_FULL','STOCK_DAILY','STOCK_MONTHLY','ALERTS','MORNING_DIGEST','INVESTOR_STATEMENT') NOT NULL;
```


