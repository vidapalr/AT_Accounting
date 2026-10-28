-- Abhiram Group Accounting: base database structure (accounting tables only, no data).
-- Saved from the live database on 28 Oct 2026. It already includes every migration up to 040.
-- FOR A NEW, EMPTY DATABASE ONLY. Do not run this on the live database, and do not run
-- migrations 001-040 after it. Migrations after 040 are applied on top, in number order.
-- Check after loading: 106 tables, 5 triggers (the journal guards).
-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Server version: 11.8.9-MariaDB-log
-- PHP Version: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;


-- --------------------------------------------------------

--
-- Table structure for table `acct_accounting_periods`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_advances`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_advance_transactions`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_agreement_amendments`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_agreement_funding_policies`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_agreement_versions`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_amendment_evidence_reviews`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_approval_handouts`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_approval_items`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_app_users`
--

CREATE TABLE `acct_app_users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `full_name` varchar(160) NOT NULL,
  `email` varchar(190) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `status` enum('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_asset_depreciation`
--

CREATE TABLE `acct_asset_depreciation` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `run_id` bigint(20) UNSIGNED NOT NULL,
  `asset_id` bigint(20) UNSIGNED NOT NULL,
  `amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_asset_dep_runs`
--

CREATE TABLE `acct_asset_dep_runs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `division_id` bigint(20) UNSIGNED NOT NULL,
  `period` char(7) NOT NULL,
  `total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_auditor_adjustments`
--

CREATE TABLE `acct_auditor_adjustments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `adjustment_no` varchar(60) NOT NULL,
  `entry_date` date NOT NULL,
  `reason` varchar(300) NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_audit_events`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_bank_accounts`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_bank_evidence`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_bank_verifications`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_branches`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_business_documents`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_business_people`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_business_settings`
--

CREATE TABLE `acct_business_settings` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `setting_key` varchar(80) NOT NULL,
  `setting_value` varchar(255) NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_cash_accounts`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_cash_closings`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_chart_of_accounts`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_customers`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_customer_messages`
--

CREATE TABLE `acct_customer_messages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `message_type` enum('NEW_STOCK','DUES_REMINDER','OTHER') NOT NULL DEFAULT 'NEW_STOCK',
  `batch_key` varchar(120) NOT NULL,
  `sent_by` bigint(20) UNSIGNED DEFAULT NULL,
  `sent_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_divisions`
--

CREATE TABLE `acct_divisions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(180) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_document_sequences`
--

CREATE TABLE `acct_document_sequences` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `document_type` varchar(20) NOT NULL,
  `code_prefix` varchar(40) NOT NULL,
  `last_number` bigint(20) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_employees`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_expenses`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_expense_payments`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_financial_scenarios`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_financial_years`
--

CREATE TABLE `acct_financial_years` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `label` varchar(16) NOT NULL,
  `starts_on` date NOT NULL,
  `ends_on` date NOT NULL,
  `status` enum('OPEN','LOCKED','CLOSED') NOT NULL DEFAULT 'OPEN'
) ;

-- --------------------------------------------------------

--
-- Table structure for table `acct_fixed_assets`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_free_stock`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_free_stock_lines`
--

CREATE TABLE `acct_free_stock_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `free_stock_id` bigint(20) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) DEFAULT NULL,
  `total_cost` decimal(18,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_funding_agreements`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_funding_parties`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_funding_transactions`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_historical_funding_batches`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_historical_funding_items`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_instagram_posts`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_inventory_locations`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_investor_bank_scopes`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_invoice_shares`
--

CREATE TABLE `acct_invoice_shares` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `sale_id` bigint(20) UNSIGNED NOT NULL,
  `token` char(32) NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_journal_entries`
--

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

--
-- Triggers `acct_journal_entries`
--
DELIMITER $$
CREATE TRIGGER `trg_acct_journal_header_delete_guard` BEFORE DELETE ON `acct_journal_entries` FOR EACH ROW BEGIN
    IF OLD.status IN ('POSTED', 'REVERSED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
                'Cannot delete posted or reversed journals';
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_acct_journal_header_update_guard` BEFORE UPDATE ON `acct_journal_entries` FOR EACH ROW BEGIN
    IF OLD.status IN ('POSTED', 'REVERSED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
                'Posted/reversed journal headers are immutable';
    END IF;

    IF OLD.status = 'DRAFT'
       AND NEW.status NOT IN ('DRAFT', 'POSTED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
                'Invalid journal status transition';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `acct_journal_lines`
--

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

--
-- Triggers `acct_journal_lines`
--
DELIMITER $$
CREATE TRIGGER `trg_acct_journal_line_delete_guard` BEFORE DELETE ON `acct_journal_lines` FOR EACH ROW BEGIN
    DECLARE parent_status VARCHAR(20) DEFAULT NULL;

    SELECT status INTO parent_status
    FROM acct_journal_entries
    WHERE id = OLD.journal_entry_id
      AND legal_business_id = OLD.legal_business_id;

    IF parent_status IS NULL
       OR parent_status <> 'DRAFT' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
                'Cannot delete lines of a posted journal';
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_acct_journal_line_insert_guard` BEFORE INSERT ON `acct_journal_lines` FOR EACH ROW BEGIN
    DECLARE parent_status VARCHAR(20) DEFAULT NULL;

    SELECT status INTO parent_status
    FROM acct_journal_entries
    WHERE id = NEW.journal_entry_id
      AND legal_business_id = NEW.legal_business_id;

    IF parent_status IS NULL
       OR parent_status <> 'DRAFT' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
                'Lines can be inserted only into draft journals';
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_acct_journal_line_update_guard` BEFORE UPDATE ON `acct_journal_lines` FOR EACH ROW BEGIN
    DECLARE parent_status VARCHAR(20) DEFAULT NULL;

    SELECT status INTO parent_status
    FROM acct_journal_entries
    WHERE id = OLD.journal_entry_id
      AND legal_business_id = OLD.legal_business_id;

    IF parent_status IS NULL
       OR parent_status <> 'DRAFT' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
                'Cannot modify lines of a posted journal';
    END IF;

    IF NEW.journal_entry_id <> OLD.journal_entry_id
       OR NEW.legal_business_id <> OLD.legal_business_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT =
                'Moving journal lines between journals is prohibited';
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `acct_journal_post_sequences`
--

CREATE TABLE `acct_journal_post_sequences` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `financial_year_id` bigint(20) UNSIGNED NOT NULL,
  `last_number` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_journal_reversals`
--

CREATE TABLE `acct_journal_reversals` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `original_journal_id` bigint(20) UNSIGNED NOT NULL,
  `reversal_journal_id` bigint(20) UNSIGNED NOT NULL,
  `reversal_reason` varchar(1000) NOT NULL,
  `reversed_by` bigint(20) UNSIGNED NOT NULL,
  `reversed_at` datetime NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Table structure for table `acct_journal_sequences`
--

CREATE TABLE `acct_journal_sequences` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `fiscal_year_label` varchar(9) NOT NULL,
  `last_number` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_legal_businesses`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_offers`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_offer_products`
--

CREATE TABLE `acct_offer_products` (
  `offer_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_online_orders`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_online_order_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_opening_balance_authorizations`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_opening_balance_batches`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_opening_balance_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_opening_funding_details`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_opening_investor_bank_balances`
--

CREATE TABLE `acct_opening_investor_bank_balances` (
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `batch_id` bigint(20) UNSIGNED NOT NULL,
  `bank_account_id` bigint(20) UNSIGNED NOT NULL,
  `opening_amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_owner_money`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_party_setoffs`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_party_setoff_lines`
--

CREATE TABLE `acct_party_setoff_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `setoff_id` bigint(20) UNSIGNED NOT NULL,
  `side` enum('SALE','PURCHASE') NOT NULL,
  `doc_id` bigint(20) UNSIGNED NOT NULL,
  `payment_id` bigint(20) UNSIGNED NOT NULL,
  `amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_products`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_product_categories`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_product_media`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_product_variants`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_profit_allocations`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_profit_waterfall_policies`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_purchase_headers`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_purchase_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_purchase_orders`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_purchase_order_lines`
--

CREATE TABLE `acct_purchase_order_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED NOT NULL,
  `line_no` int(10) UNSIGNED NOT NULL,
  `variant_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` decimal(14,3) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `line_amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_purchase_payments`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_salary_payments`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_sales_headers`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_sales_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_sales_payments`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_sales_refunds`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_sales_returns`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_sales_return_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_scenario_assumptions`
--

CREATE TABLE `acct_scenario_assumptions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `scenario_id` bigint(20) UNSIGNED NOT NULL,
  `metric_code` varchar(60) NOT NULL,
  `period_month` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `reason` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_sessions`
--

CREATE TABLE `acct_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_shop_customers`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_shop_password_resets`
--

CREATE TABLE `acct_shop_password_resets` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_shop_sessions`
--

CREATE TABLE `acct_shop_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_staff_advances`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_staff_advance_recoveries`
--

CREATE TABLE `acct_staff_advance_recoveries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `advance_id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `expense_payment_id` bigint(20) UNSIGNED NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `recovered_on` date NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_counts`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_count_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_damages`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_drafts`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_events`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_movements`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_reporters`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_transfers`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_stock_transfer_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_suppliers`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_supplier_refunds`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_supplier_returns`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_supplier_return_lines`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_supplier_return_replacements`
--

CREATE TABLE `acct_supplier_return_replacements` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `legal_business_id` bigint(20) UNSIGNED NOT NULL,
  `return_id` bigint(20) UNSIGNED NOT NULL,
  `purchase_id` bigint(20) UNSIGNED NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `acct_user_access`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_whatsapp_outbox`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_whatsapp_recipients`
--

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

-- --------------------------------------------------------

--
-- Table structure for table `acct_whatsapp_subscriptions`
--

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

-- --------------------------------------------------------

--
-- Indexes for dumped tables
--

--
-- Indexes for table `acct_accounting_periods`
--
ALTER TABLE `acct_accounting_periods`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_period_business_year_no` (`legal_business_id`,`fiscal_year_label`,`period_no`),
  ADD UNIQUE KEY `uq_period_business_dates` (`legal_business_id`,`start_date`,`end_date`),
  ADD UNIQUE KEY `uq_acct_period_business_id` (`legal_business_id`,`id`),
  ADD KEY `idx_period_business_date` (`legal_business_id`,`start_date`,`end_date`,`status`);

--
-- Indexes for table `acct_advances`
--
ALTER TABLE `acct_advances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_advance_no` (`legal_business_id`,`advance_no`),
  ADD UNIQUE KEY `uq_advance_business_id` (`legal_business_id`,`id`),
  ADD KEY `fk_advance_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_advance_creator` (`created_by`);

--
-- Indexes for table `acct_advance_transactions`
--
ALTER TABLE `acct_advance_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_advance_transactions` (`legal_business_id`,`advance_id`,`transaction_date`),
  ADD KEY `fk_advance_tx_bank` (`bank_account_id`),
  ADD KEY `fk_advance_tx_cash` (`cash_account_id`),
  ADD KEY `fk_advance_tx_funding` (`legal_business_id`,`funding_party_id`),
  ADD KEY `fk_advance_tx_creator` (`created_by`);

--
-- Indexes for table `acct_agreement_amendments`
--
ALTER TABLE `acct_agreement_amendments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_amendment_target_version` (`to_version_id`),
  ADD KEY `fk_amend_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_amend_from` (`from_version_id`),
  ADD KEY `fk_amend_requester` (`requested_by`),
  ADD KEY `fk_amend_reviewer` (`reviewed_by`);

--
-- Indexes for table `acct_agreement_funding_policies`
--
ALTER TABLE `acct_agreement_funding_policies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_policy_agreement_version` (`agreement_version_id`),
  ADD KEY `fk_policy_creator` (`created_by`),
  ADD KEY `idx_policy_business_agreement` (`legal_business_id`,`agreement_id`);

--
-- Indexes for table `acct_agreement_versions`
--
ALTER TABLE `acct_agreement_versions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_agreement_version` (`agreement_id`,`version_no`),
  ADD KEY `fk_version_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_version_creator` (`created_by`),
  ADD KEY `fk_version_approver` (`approved_by`);

--
-- Indexes for table `acct_amendment_evidence_reviews`
--
ALTER TABLE `acct_amendment_evidence_reviews`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_amendment_evidence_review` (`amendment_id`),
  ADD KEY `idx_amendment_evidence_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `idx_amendment_evidence_document` (`signed_document_id`);

--
-- Indexes for table `acct_approval_handouts`
--
ALTER TABLE `acct_approval_handouts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_approval_handout_no` (`legal_business_id`,`handout_no`),
  ADD KEY `idx_approval_handout_customer` (`legal_business_id`,`customer_id`);

--
-- Indexes for table `acct_approval_items`
--
ALTER TABLE `acct_approval_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_approval_item_handout` (`legal_business_id`,`handout_id`),
  ADD KEY `idx_approval_item_status` (`legal_business_id`,`status`),
  ADD KEY `idx_approval_item_customer` (`legal_business_id`,`customer_id`);

--
-- Indexes for table `acct_app_users`
--
ALTER TABLE `acct_app_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `acct_asset_depreciation`
--
ALTER TABLE `acct_asset_depreciation`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_asset_dep_once` (`run_id`,`asset_id`),
  ADD KEY `idx_asset_dep_asset` (`asset_id`);

--
-- Indexes for table `acct_asset_dep_runs`
--
ALTER TABLE `acct_asset_dep_runs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_asset_dep_run` (`legal_business_id`,`division_id`,`period`);

--
-- Indexes for table `acct_auditor_adjustments`
--
ALTER TABLE `acct_auditor_adjustments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_auditor_adjustment_no` (`legal_business_id`,`adjustment_no`);

--
-- Indexes for table `acct_audit_events`
--
ALTER TABLE `acct_audit_events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_audit_subject` (`subject_type`,`subject_id`),
  ADD KEY `legal_business_id` (`legal_business_id`),
  ADD KEY `actor_user_id` (`actor_user_id`);

--
-- Indexes for table `acct_bank_accounts`
--
ALTER TABLE `acct_bank_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bank_account_fingerprint` (`legal_business_id`,`account_number_fingerprint`),
  ADD UNIQUE KEY `uq_bank_business_gl` (`legal_business_id`,`gl_account_id`),
  ADD KEY `idx_bank_owner` (`legal_business_id`,`ownership_type`,`funding_party_id`),
  ADD KEY `idx_bank_status` (`legal_business_id`,`status`);

--
-- Indexes for table `acct_bank_evidence`
--
ALTER TABLE `acct_bank_evidence`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_bank_evidence_storage` (`storage_key`),
  ADD KEY `idx_bank_evidence_account` (`legal_business_id`,`bank_account_id`),
  ADD KEY `fk_bank_evidence_account` (`bank_account_id`);

--
-- Indexes for table `acct_bank_verifications`
--
ALTER TABLE `acct_bank_verifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_bank_verification_account` (`legal_business_id`,`bank_account_id`,`verified_at`),
  ADD KEY `idx_bank_verification_evidence` (`evidence_document_id`),
  ADD KEY `fk_bank_verify_account` (`bank_account_id`);

--
-- Indexes for table `acct_branches`
--
ALTER TABLE `acct_branches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_branch_code` (`legal_business_id`,`division_id`,`branch_code`),
  ADD UNIQUE KEY `uq_branch_business_division_id` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_branch_division` (`division_id`);

--
-- Indexes for table `acct_business_documents`
--
ALTER TABLE `acct_business_documents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_doc_division` (`division_id`),
  ADD KEY `fk_doc_person` (`person_id`),
  ADD KEY `fk_doc_user` (`uploaded_by`),
  ADD KEY `idx_acct_documents_status` (`legal_business_id`,`status`),
  ADD KEY `idx_acct_doc_agreement` (`legal_business_id`,`funding_agreement_id`,`agreement_version_id`),
  ADD KEY `fk_acct_doc_agreement_version` (`agreement_version_id`);

--
-- Indexes for table `acct_business_people`
--
ALTER TABLE `acct_business_people`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_people_business` (`legal_business_id`),
  ADD KEY `idx_people_division` (`division_id`);

--
-- Indexes for table `acct_business_settings`
--
ALTER TABLE `acct_business_settings`
  ADD PRIMARY KEY (`legal_business_id`,`setting_key`);

--
-- Indexes for table `acct_cash_accounts`
--
ALTER TABLE `acct_cash_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cash_business_code` (`legal_business_id`,`cash_code`),
  ADD UNIQUE KEY `uq_cash_business_gl` (`legal_business_id`,`gl_account_id`),
  ADD KEY `idx_cash_division_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_cash_division` (`division_id`,`legal_business_id`);

--
-- Indexes for table `acct_cash_closings`
--
ALTER TABLE `acct_cash_closings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cash_closing_day` (`legal_business_id`,`cash_account_id`,`closing_date`);

--
-- Indexes for table `acct_chart_of_accounts`
--
ALTER TABLE `acct_chart_of_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_coa_business_code` (`legal_business_id`,`account_code`),
  ADD UNIQUE KEY `uq_coa_business_id` (`legal_business_id`,`id`),
  ADD UNIQUE KEY `uq_coa_id_business` (`id`,`legal_business_id`),
  ADD KEY `idx_coa_business_type` (`legal_business_id`,`account_type`,`status`),
  ADD KEY `idx_coa_parent` (`legal_business_id`,`parent_account_id`);

--
-- Indexes for table `acct_customers`
--
ALTER TABLE `acct_customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_customer_code` (`legal_business_id`,`customer_code`),
  ADD UNIQUE KEY `uq_customer_phone` (`legal_business_id`,`phone`),
  ADD KEY `idx_customer_name` (`legal_business_id`,`full_name`);

--
-- Indexes for table `acct_customer_messages`
--
ALTER TABLE `acct_customer_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_customer_message_batch` (`legal_business_id`,`batch_key`,`customer_id`),
  ADD KEY `idx_customer_message_customer` (`legal_business_id`,`customer_id`,`sent_at`);

--
-- Indexes for table `acct_divisions`
--
ALTER TABLE `acct_divisions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_division_code` (`legal_business_id`,`code`),
  ADD UNIQUE KEY `uq_division_business_id` (`id`,`legal_business_id`);

--
-- Indexes for table `acct_document_sequences`
--
ALTER TABLE `acct_document_sequences`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_document_sequence` (`legal_business_id`,`document_type`,`code_prefix`);

--
-- Indexes for table `acct_employees`
--
ALTER TABLE `acct_employees`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_employee_business` (`legal_business_id`,`status`);

--
-- Indexes for table `acct_expenses`
--
ALTER TABLE `acct_expenses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_expense_no` (`legal_business_id`,`expense_no`),
  ADD UNIQUE KEY `uq_expense_scope` (`legal_business_id`,`division_id`,`id`),
  ADD UNIQUE KEY `uq_expense_business_id` (`legal_business_id`,`id`),
  ADD KEY `idx_expense_date` (`legal_business_id`,`division_id`,`expense_date`),
  ADD KEY `idx_expense_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_expense_creator` (`created_by`),
  ADD KEY `fk_expense_confirmer` (`confirmed_by`);

--
-- Indexes for table `acct_expense_payments`
--
ALTER TABLE `acct_expense_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_expense_payment_expense` (`legal_business_id`,`division_id`,`expense_id`),
  ADD KEY `idx_expense_payment_date` (`legal_business_id`,`payment_date`),
  ADD KEY `idx_expense_payment_bank` (`bank_account_id`),
  ADD KEY `idx_expense_payment_cash` (`cash_account_id`),
  ADD KEY `fk_exp_pay_funding_party` (`legal_business_id`,`funding_party_id`),
  ADD KEY `fk_exp_pay_creator` (`created_by`),
  ADD KEY `fk_exp_pay_expense_business` (`legal_business_id`,`expense_id`);

--
-- Indexes for table `acct_financial_scenarios`
--
ALTER TABLE `acct_financial_scenarios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `legal_business_id` (`legal_business_id`),
  ADD KEY `division_id` (`division_id`,`legal_business_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `acct_financial_years`
--
ALTER TABLE `acct_financial_years`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_business_fy` (`legal_business_id`,`label`),
  ADD UNIQUE KEY `uq_fy_business_id` (`id`,`legal_business_id`);

--
-- Indexes for table `acct_fixed_assets`
--
ALTER TABLE `acct_fixed_assets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_fixed_asset_no` (`legal_business_id`,`asset_no`),
  ADD KEY `idx_fixed_asset_status` (`legal_business_id`,`division_id`,`status`);

--
-- Indexes for table `acct_free_stock`
--
ALTER TABLE `acct_free_stock`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_free_stock_no` (`legal_business_id`,`entry_no`),
  ADD KEY `idx_free_stock_status` (`legal_business_id`,`status`,`given_date`);

--
-- Indexes for table `acct_free_stock_lines`
--
ALTER TABLE `acct_free_stock_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_free_stock_lines_entry` (`legal_business_id`,`free_stock_id`);

--
-- Indexes for table `acct_funding_agreements`
--
ALTER TABLE `acct_funding_agreements`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_funding_agreement_no` (`legal_business_id`,`agreement_no`),
  ADD UNIQUE KEY `uq_funding_agreement_business_id` (`legal_business_id`,`id`),
  ADD KEY `fk_agreement_party` (`legal_business_id`,`party_id`),
  ADD KEY `fk_agreement_division` (`division_id`),
  ADD KEY `fk_agreement_user` (`created_by`),
  ADD KEY `idx_funding_agreement_branch` (`branch_id`);

--
-- Indexes for table `acct_funding_parties`
--
ALTER TABLE `acct_funding_parties`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_funding_party_code` (`legal_business_id`,`party_code`),
  ADD UNIQUE KEY `uq_funding_party_business_id` (`legal_business_id`,`id`);

--
-- Indexes for table `acct_funding_transactions`
--
ALTER TABLE `acct_funding_transactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_funding_transaction_no` (`legal_business_id`,`transaction_no`),
  ADD KEY `fk_funding_tx_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_funding_tx_journal` (`journal_entry_id`),
  ADD KEY `fk_funding_tx_user` (`created_by`),
  ADD KEY `idx_funding_tx_agreement_date` (`agreement_id`,`transaction_date`),
  ADD KEY `fk_funding_tx_version` (`agreement_version_id`);

--
-- Indexes for table `acct_historical_funding_batches`
--
ALTER TABLE `acct_historical_funding_batches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_historical_funding_batch_ref` (`legal_business_id`,`batch_reference`),
  ADD UNIQUE KEY `uq_historical_funding_batch_scope` (`legal_business_id`,`id`),
  ADD KEY `fk_historical_batch_creator` (`created_by`),
  ADD KEY `fk_historical_batch_approver` (`approved_by`);

--
-- Indexes for table `acct_historical_funding_items`
--
ALTER TABLE `acct_historical_funding_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_historical_item_line` (`batch_id`,`line_no`),
  ADD UNIQUE KEY `uq_historical_imported_transaction` (`imported_transaction_id`),
  ADD KEY `idx_historical_item_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_historical_item_batch` (`legal_business_id`,`batch_id`),
  ADD KEY `fk_historical_item_version` (`agreement_version_id`);

--
-- Indexes for table `acct_instagram_posts`
--
ALTER TABLE `acct_instagram_posts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_ig_product` (`legal_business_id`,`product_id`,`created_at`);

--
-- Indexes for table `acct_inventory_locations`
--
ALTER TABLE `acct_inventory_locations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_inventory_location_code` (`legal_business_id`,`location_code`),
  ADD UNIQUE KEY `uq_inventory_location_scope` (`legal_business_id`,`id`),
  ADD KEY `idx_inventory_location_division` (`legal_business_id`,`division_id`),
  ADD KEY `idx_inventory_location_branch` (`legal_business_id`,`division_id`,`branch_id`),
  ADD KEY `fk_inventory_location_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_inventory_location_creator` (`created_by`);

--
-- Indexes for table `acct_investor_bank_scopes`
--
ALTER TABLE `acct_investor_bank_scopes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_investor_bank_scope` (`bank_account_id`,`legal_business_id`,`funding_party_id`,`division_id`,`branch_id`),
  ADD KEY `idx_investor_scope` (`legal_business_id`,`funding_party_id`,`division_id`,`branch_id`),
  ADD KEY `fk_ibs_party` (`funding_party_id`),
  ADD KEY `fk_ibs_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_ibs_branch` (`legal_business_id`,`division_id`,`branch_id`);

--
-- Indexes for table `acct_invoice_shares`
--
ALTER TABLE `acct_invoice_shares`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_invoice_share_sale` (`legal_business_id`,`sale_id`),
  ADD UNIQUE KEY `uq_invoice_share_token` (`token`);

--
-- Indexes for table `acct_journal_entries`
--
ALTER TABLE `acct_journal_entries`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_journal_no` (`legal_business_id`,`journal_no`),
  ADD UNIQUE KEY `uq_journal_business_id` (`id`,`legal_business_id`),
  ADD KEY `idx_journal_date` (`legal_business_id`,`entry_date`,`status`),
  ADD KEY `financial_year_id` (`financial_year_id`,`legal_business_id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `fk_journal_period_business` (`legal_business_id`,`accounting_period_id`),
  ADD KEY `idx_journal_source` (`legal_business_id`,`source_type`,`source_id`);

--
-- Indexes for table `acct_journal_lines`
--
ALTER TABLE `acct_journal_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_journal_line` (`journal_entry_id`,`line_no`),
  ADD KEY `idx_account_division` (`legal_business_id`,`account_id`,`division_id`),
  ADD KEY `journal_entry_id` (`journal_entry_id`,`legal_business_id`),
  ADD KEY `division_id` (`division_id`,`legal_business_id`),
  ADD KEY `acct_journal_lines_ibfk_2` (`account_id`,`legal_business_id`),
  ADD KEY `idx_journal_branch` (`legal_business_id`,`division_id`,`branch_id`);

--
-- Indexes for table `acct_journal_post_sequences`
--
ALTER TABLE `acct_journal_post_sequences`
  ADD PRIMARY KEY (`legal_business_id`,`financial_year_id`),
  ADD KEY `fk_journal_seq_fy` (`financial_year_id`,`legal_business_id`);

--
-- Indexes for table `acct_journal_reversals`
--
ALTER TABLE `acct_journal_reversals`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_original_reversal` (`legal_business_id`,`original_journal_id`),
  ADD UNIQUE KEY `uq_reversal_journal` (`legal_business_id`,`reversal_journal_id`),
  ADD KEY `fk_reversal_original` (`original_journal_id`,`legal_business_id`),
  ADD KEY `fk_reversal_journal` (`reversal_journal_id`,`legal_business_id`),
  ADD KEY `fk_reversal_actor` (`reversed_by`);

--
-- Indexes for table `acct_journal_sequences`
--
ALTER TABLE `acct_journal_sequences`
  ADD PRIMARY KEY (`legal_business_id`,`fiscal_year_label`);

--
-- Indexes for table `acct_legal_businesses`
--
ALTER TABLE `acct_legal_businesses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `acct_offers`
--
ALTER TABLE `acct_offers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_offers_business` (`legal_business_id`,`status`,`starts_on`,`ends_on`);

--
-- Indexes for table `acct_offer_products`
--
ALTER TABLE `acct_offer_products`
  ADD PRIMARY KEY (`offer_id`,`product_id`);

--
-- Indexes for table `acct_online_orders`
--
ALTER TABLE `acct_online_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_online_order_no` (`legal_business_id`,`order_no`),
  ADD KEY `idx_online_order_status` (`legal_business_id`,`status`,`created_at`);

--
-- Indexes for table `acct_online_order_lines`
--
ALTER TABLE `acct_online_order_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_online_line_order` (`order_id`);

--
-- Indexes for table `acct_opening_balance_authorizations`
--
ALTER TABLE `acct_opening_balance_authorizations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_authorization_batch` (`legal_business_id`,`batch_id`),
  ADD KEY `fk_oba_approver` (`approved_by`),
  ADD KEY `fk_oba_revoker` (`revoked_by`);

--
-- Indexes for table `acct_opening_balance_batches`
--
ALTER TABLE `acct_opening_balance_batches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_business` (`legal_business_id`),
  ADD UNIQUE KEY `uq_opening_business_id` (`legal_business_id`,`id`),
  ADD UNIQUE KEY `uq_opening_posted_journal` (`posted_journal_id`),
  ADD KEY `fk_opening_fy` (`financial_year_id`,`legal_business_id`),
  ADD KEY `fk_opening_period` (`legal_business_id`,`accounting_period_id`),
  ADD KEY `fk_opening_journal` (`posted_journal_id`,`legal_business_id`);

--
-- Indexes for table `acct_opening_balance_lines`
--
ALTER TABLE `acct_opening_balance_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_line` (`batch_id`,`line_no`),
  ADD UNIQUE KEY `uq_opening_line_business_id` (`legal_business_id`,`id`),
  ADD KEY `idx_opening_account` (`legal_business_id`,`account_id`),
  ADD KEY `fk_opening_line_batch` (`legal_business_id`,`batch_id`),
  ADD KEY `fk_opening_line_account` (`account_id`,`legal_business_id`),
  ADD KEY `fk_opening_line_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_opening_line_branch` (`legal_business_id`,`division_id`,`branch_id`);

--
-- Indexes for table `acct_opening_funding_details`
--
ALTER TABLE `acct_opening_funding_details`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_opening_funding_line` (`legal_business_id`,`opening_line_id`),
  ADD KEY `idx_opening_funding_party` (`legal_business_id`,`funding_party_id`),
  ADD KEY `fk_ofd_party` (`funding_party_id`),
  ADD KEY `idx_opening_funding_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_opening_funding_agreement` (`agreement_id`);

--
-- Indexes for table `acct_opening_investor_bank_balances`
--
ALTER TABLE `acct_opening_investor_bank_balances`
  ADD PRIMARY KEY (`batch_id`,`bank_account_id`),
  ADD KEY `idx_opening_investor_bank_business` (`legal_business_id`,`bank_account_id`);

--
-- Indexes for table `acct_owner_money`
--
ALTER TABLE `acct_owner_money`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_owner_money_no` (`legal_business_id`,`entry_no`),
  ADD KEY `idx_owner_money_date` (`legal_business_id`,`entry_date`);

--
-- Indexes for table `acct_party_setoffs`
--
ALTER TABLE `acct_party_setoffs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_party_setoff_no` (`legal_business_id`,`setoff_no`),
  ADD KEY `idx_party_setoff_supplier` (`legal_business_id`,`supplier_id`),
  ADD KEY `idx_party_setoff_customer` (`legal_business_id`,`customer_id`);

--
-- Indexes for table `acct_party_setoff_lines`
--
ALTER TABLE `acct_party_setoff_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_party_setoff_line` (`setoff_id`);

--
-- Indexes for table `acct_products`
--
ALTER TABLE `acct_products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_product_code` (`legal_business_id`,`division_id`,`product_code`),
  ADD UNIQUE KEY `uq_product_scope` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_product_category` (`legal_business_id`,`division_id`,`category_id`),
  ADD KEY `fk_product_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_product_creator` (`created_by`);

--
-- Indexes for table `acct_product_categories`
--
ALTER TABLE `acct_product_categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_category_code` (`legal_business_id`,`division_id`,`category_code`),
  ADD UNIQUE KEY `uq_category_scope` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_category_parent` (`legal_business_id`,`division_id`,`parent_category_id`),
  ADD KEY `fk_category_division` (`division_id`,`legal_business_id`),
  ADD KEY `fk_category_creator` (`created_by`);

--
-- Indexes for table `acct_product_media`
--
ALTER TABLE `acct_product_media`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_media_key` (`storage_key`),
  ADD KEY `idx_media_product` (`legal_business_id`,`product_id`,`status`);

--
-- Indexes for table `acct_product_variants`
--
ALTER TABLE `acct_product_variants`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_variant_sku` (`legal_business_id`,`sku`),
  ADD UNIQUE KEY `uq_variant_scope` (`legal_business_id`,`division_id`,`id`),
  ADD UNIQUE KEY `uq_variant_barcode` (`legal_business_id`,`barcode`),
  ADD KEY `idx_variant_product` (`legal_business_id`,`division_id`,`product_id`),
  ADD KEY `fk_variant_creator` (`created_by`);

--
-- Indexes for table `acct_profit_allocations`
--
ALTER TABLE `acct_profit_allocations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_profit_allocation_agreement` (`legal_business_id`,`agreement_id`),
  ADD KEY `fk_profit_allocation_approver` (`approved_by`);

--
-- Indexes for table `acct_profit_waterfall_policies`
--
ALTER TABLE `acct_profit_waterfall_policies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_waterfall_division` (`division_id`),
  ADD KEY `fk_waterfall_creator` (`created_by`),
  ADD KEY `idx_waterfall_period` (`legal_business_id`,`division_id`,`effective_from`,`effective_to`);

--
-- Indexes for table `acct_purchase_headers`
--
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

--
-- Indexes for table `acct_purchase_lines`
--
ALTER TABLE `acct_purchase_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_purchase_line_no` (`purchase_id`,`line_no`),
  ADD UNIQUE KEY `uq_purchase_line_scope` (`legal_business_id`,`division_id`,`id`),
  ADD KEY `idx_purchase_line_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_purchase_line_header` (`legal_business_id`,`division_id`,`purchase_id`);

--
-- Indexes for table `acct_purchase_orders`
--
ALTER TABLE `acct_purchase_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_purchase_order_no` (`legal_business_id`,`order_no`),
  ADD KEY `idx_purchase_order_status` (`legal_business_id`,`division_id`,`status`),
  ADD KEY `idx_purchase_order_supplier` (`legal_business_id`,`supplier_id`);

--
-- Indexes for table `acct_purchase_order_lines`
--
ALTER TABLE `acct_purchase_order_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_purchase_order_line` (`order_id`);

--
-- Indexes for table `acct_purchase_payments`
--
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

--
-- Indexes for table `acct_salary_payments`
--
ALTER TABLE `acct_salary_payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_salary_employee_month` (`legal_business_id`,`employee_id`,`salary_month`);

--
-- Indexes for table `acct_sales_headers`
--
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

--
-- Indexes for table `acct_sales_lines`
--
ALTER TABLE `acct_sales_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_lines_sale` (`sale_id`),
  ADD KEY `idx_sales_lines_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_sales_line_header` (`legal_business_id`,`division_id`,`sale_id`);

--
-- Indexes for table `acct_sales_payments`
--
ALTER TABLE `acct_sales_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_payment_sale` (`legal_business_id`,`division_id`,`sale_id`),
  ADD KEY `fk_sales_payment_creator` (`created_by`);

--
-- Indexes for table `acct_sales_refunds`
--
ALTER TABLE `acct_sales_refunds`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_refund_return` (`legal_business_id`,`return_id`);

--
-- Indexes for table `acct_sales_returns`
--
ALTER TABLE `acct_sales_returns`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_sales_return_no` (`legal_business_id`,`return_no`),
  ADD KEY `idx_sales_return_sale` (`legal_business_id`,`sale_id`);

--
-- Indexes for table `acct_sales_return_lines`
--
ALTER TABLE `acct_sales_return_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_return_lines_return` (`return_id`),
  ADD KEY `idx_return_lines_sale_line` (`legal_business_id`,`sale_line_id`);

--
-- Indexes for table `acct_scenario_assumptions`
--
ALTER TABLE `acct_scenario_assumptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_scenario_period` (`scenario_id`,`period_month`);

--
-- Indexes for table `acct_sessions`
--
ALTER TABLE `acct_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_acct_session_token` (`token_hash`),
  ADD KEY `idx_acct_session_user` (`user_id`),
  ADD KEY `idx_acct_session_expiry` (`expires_at`);

--
-- Indexes for table `acct_shop_customers`
--
ALTER TABLE `acct_shop_customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_shop_customer_email` (`legal_business_id`,`email`);

--
-- Indexes for table `acct_shop_password_resets`
--
ALTER TABLE `acct_shop_password_resets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_shop_reset_token` (`token_hash`),
  ADD KEY `idx_shop_reset_customer` (`customer_id`);

--
-- Indexes for table `acct_shop_sessions`
--
ALTER TABLE `acct_shop_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_shop_session_token` (`token_hash`),
  ADD KEY `idx_shop_session_customer` (`customer_id`);

--
-- Indexes for table `acct_staff_advances`
--
ALTER TABLE `acct_staff_advances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_staff_advance_no` (`legal_business_id`,`advance_no`),
  ADD KEY `idx_staff_advance_employee` (`legal_business_id`,`employee_id`);

--
-- Indexes for table `acct_staff_advance_recoveries`
--
ALTER TABLE `acct_staff_advance_recoveries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_staff_recovery_advance` (`advance_id`),
  ADD KEY `idx_staff_recovery_employee` (`employee_id`);

--
-- Indexes for table `acct_stock_counts`
--
ALTER TABLE `acct_stock_counts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_count_no` (`legal_business_id`,`count_no`),
  ADD KEY `idx_stock_count_location` (`legal_business_id`,`location_id`);

--
-- Indexes for table `acct_stock_count_lines`
--
ALTER TABLE `acct_stock_count_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_count_line` (`count_id`,`variant_id`),
  ADD KEY `idx_count_line_count` (`legal_business_id`,`count_id`);

--
-- Indexes for table `acct_stock_damages`
--
ALTER TABLE `acct_stock_damages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_stock_damage_variant` (`legal_business_id`,`location_id`,`variant_id`);

--
-- Indexes for table `acct_stock_drafts`
--
ALTER TABLE `acct_stock_drafts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_draft_wa` (`legal_business_id`,`wa_message_id`,`raw_line`(100)),
  ADD KEY `idx_stock_draft_status` (`legal_business_id`,`status`,`created_at`);

--
-- Indexes for table `acct_stock_events`
--
ALTER TABLE `acct_stock_events`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_event` (`legal_business_id`,`source_type`,`source_id`,`variant_id`),
  ADD KEY `idx_stock_event_status` (`legal_business_id`,`status`,`created_at`);

--
-- Indexes for table `acct_stock_movements`
--
ALTER TABLE `acct_stock_movements`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_stock_source_line_movement` (`legal_business_id`,`movement_type`,`source_type`,`source_line_id`),
  ADD KEY `idx_stock_location_variant` (`legal_business_id`,`location_id`,`variant_id`),
  ADD KEY `idx_stock_movement_date` (`legal_business_id`,`movement_date`),
  ADD KEY `idx_stock_source` (`legal_business_id`,`source_type`,`source_id`),
  ADD KEY `fk_stock_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_stock_creator` (`created_by`);

--
-- Indexes for table `acct_stock_reporters`
--
ALTER TABLE `acct_stock_reporters`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_reporter_phone` (`legal_business_id`,`phone`);

--
-- Indexes for table `acct_stock_transfers`
--
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

--
-- Indexes for table `acct_stock_transfer_lines`
--
ALTER TABLE `acct_stock_transfer_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_transfer_variant` (`transfer_id`,`variant_id`),
  ADD KEY `idx_transfer_line_variant` (`legal_business_id`,`division_id`,`variant_id`),
  ADD KEY `fk_transfer_line_header` (`legal_business_id`,`division_id`,`transfer_id`);

--
-- Indexes for table `acct_suppliers`
--
ALTER TABLE `acct_suppliers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_supplier_code` (`legal_business_id`,`supplier_code`),
  ADD UNIQUE KEY `uq_supplier_scope` (`legal_business_id`,`id`),
  ADD KEY `idx_supplier_name` (`legal_business_id`,`supplier_name`),
  ADD KEY `fk_supplier_creator` (`created_by`);

--
-- Indexes for table `acct_supplier_refunds`
--
ALTER TABLE `acct_supplier_refunds`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_supplier_refund_supplier` (`legal_business_id`,`supplier_id`),
  ADD KEY `idx_supplier_refund_return` (`legal_business_id`,`return_id`);

--
-- Indexes for table `acct_supplier_returns`
--
ALTER TABLE `acct_supplier_returns`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_supplier_return_no` (`legal_business_id`,`return_no`),
  ADD KEY `idx_supplier_return_supplier` (`legal_business_id`,`supplier_id`),
  ADD KEY `idx_supplier_return_purchase` (`legal_business_id`,`purchase_id`);

--
-- Indexes for table `acct_supplier_return_lines`
--
ALTER TABLE `acct_supplier_return_lines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_supplier_return_lines_return` (`return_id`),
  ADD KEY `idx_supplier_return_lines_pline` (`legal_business_id`,`purchase_line_id`);

--
-- Indexes for table `acct_supplier_return_replacements`
--
ALTER TABLE `acct_supplier_return_replacements`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_return_replacement` (`legal_business_id`,`return_id`,`purchase_id`);

--
-- Indexes for table `acct_user_access`
--
ALTER TABLE `acct_user_access`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_access` (`user_id`,`legal_business_id`,`division_id`,`role`),
  ADD KEY `legal_business_id` (`legal_business_id`),
  ADD KEY `division_id` (`division_id`,`legal_business_id`);

--
-- Indexes for table `acct_whatsapp_outbox`
--
ALTER TABLE `acct_whatsapp_outbox`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_wa_outbox_period` (`subscription_id`,`period_key`),
  ADD KEY `idx_wa_outbox_created` (`legal_business_id`,`created_at`);

--
-- Indexes for table `acct_whatsapp_recipients`
--
ALTER TABLE `acct_whatsapp_recipients`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_whatsapp_phone` (`legal_business_id`,`phone_e164`),
  ADD KEY `fk_wa_recipient_user` (`created_by`);

--
-- Indexes for table `acct_whatsapp_subscriptions`
--
ALTER TABLE `acct_whatsapp_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_wa_sub_recipient` (`recipient_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `acct_accounting_periods`
--
ALTER TABLE `acct_accounting_periods`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_advances`
--
ALTER TABLE `acct_advances`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_advance_transactions`
--
ALTER TABLE `acct_advance_transactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_agreement_amendments`
--
ALTER TABLE `acct_agreement_amendments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_agreement_funding_policies`
--
ALTER TABLE `acct_agreement_funding_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_agreement_versions`
--
ALTER TABLE `acct_agreement_versions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_amendment_evidence_reviews`
--
ALTER TABLE `acct_amendment_evidence_reviews`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_approval_handouts`
--
ALTER TABLE `acct_approval_handouts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_approval_items`
--
ALTER TABLE `acct_approval_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_app_users`
--
ALTER TABLE `acct_app_users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_asset_depreciation`
--
ALTER TABLE `acct_asset_depreciation`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_asset_dep_runs`
--
ALTER TABLE `acct_asset_dep_runs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_auditor_adjustments`
--
ALTER TABLE `acct_auditor_adjustments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_audit_events`
--
ALTER TABLE `acct_audit_events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_bank_accounts`
--
ALTER TABLE `acct_bank_accounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_bank_evidence`
--
ALTER TABLE `acct_bank_evidence`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_bank_verifications`
--
ALTER TABLE `acct_bank_verifications`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_branches`
--
ALTER TABLE `acct_branches`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_business_documents`
--
ALTER TABLE `acct_business_documents`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_business_people`
--
ALTER TABLE `acct_business_people`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_cash_accounts`
--
ALTER TABLE `acct_cash_accounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_cash_closings`
--
ALTER TABLE `acct_cash_closings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_chart_of_accounts`
--
ALTER TABLE `acct_chart_of_accounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_customers`
--
ALTER TABLE `acct_customers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_customer_messages`
--
ALTER TABLE `acct_customer_messages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_divisions`
--
ALTER TABLE `acct_divisions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_document_sequences`
--
ALTER TABLE `acct_document_sequences`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_employees`
--
ALTER TABLE `acct_employees`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_expenses`
--
ALTER TABLE `acct_expenses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_expense_payments`
--
ALTER TABLE `acct_expense_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_financial_scenarios`
--
ALTER TABLE `acct_financial_scenarios`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_financial_years`
--
ALTER TABLE `acct_financial_years`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_fixed_assets`
--
ALTER TABLE `acct_fixed_assets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_free_stock`
--
ALTER TABLE `acct_free_stock`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_free_stock_lines`
--
ALTER TABLE `acct_free_stock_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_funding_agreements`
--
ALTER TABLE `acct_funding_agreements`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_funding_parties`
--
ALTER TABLE `acct_funding_parties`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_funding_transactions`
--
ALTER TABLE `acct_funding_transactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_historical_funding_batches`
--
ALTER TABLE `acct_historical_funding_batches`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_historical_funding_items`
--
ALTER TABLE `acct_historical_funding_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_instagram_posts`
--
ALTER TABLE `acct_instagram_posts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_inventory_locations`
--
ALTER TABLE `acct_inventory_locations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_investor_bank_scopes`
--
ALTER TABLE `acct_investor_bank_scopes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_invoice_shares`
--
ALTER TABLE `acct_invoice_shares`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_journal_entries`
--
ALTER TABLE `acct_journal_entries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_journal_lines`
--
ALTER TABLE `acct_journal_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_journal_reversals`
--
ALTER TABLE `acct_journal_reversals`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_legal_businesses`
--
ALTER TABLE `acct_legal_businesses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_offers`
--
ALTER TABLE `acct_offers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_online_orders`
--
ALTER TABLE `acct_online_orders`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_online_order_lines`
--
ALTER TABLE `acct_online_order_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_opening_balance_authorizations`
--
ALTER TABLE `acct_opening_balance_authorizations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_opening_balance_batches`
--
ALTER TABLE `acct_opening_balance_batches`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_opening_balance_lines`
--
ALTER TABLE `acct_opening_balance_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_opening_funding_details`
--
ALTER TABLE `acct_opening_funding_details`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_owner_money`
--
ALTER TABLE `acct_owner_money`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_party_setoffs`
--
ALTER TABLE `acct_party_setoffs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_party_setoff_lines`
--
ALTER TABLE `acct_party_setoff_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_products`
--
ALTER TABLE `acct_products`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_product_categories`
--
ALTER TABLE `acct_product_categories`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_product_media`
--
ALTER TABLE `acct_product_media`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_product_variants`
--
ALTER TABLE `acct_product_variants`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_profit_allocations`
--
ALTER TABLE `acct_profit_allocations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_profit_waterfall_policies`
--
ALTER TABLE `acct_profit_waterfall_policies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_purchase_headers`
--
ALTER TABLE `acct_purchase_headers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_purchase_lines`
--
ALTER TABLE `acct_purchase_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_purchase_orders`
--
ALTER TABLE `acct_purchase_orders`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_purchase_order_lines`
--
ALTER TABLE `acct_purchase_order_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_purchase_payments`
--
ALTER TABLE `acct_purchase_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_salary_payments`
--
ALTER TABLE `acct_salary_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_sales_headers`
--
ALTER TABLE `acct_sales_headers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_sales_lines`
--
ALTER TABLE `acct_sales_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_sales_payments`
--
ALTER TABLE `acct_sales_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_sales_refunds`
--
ALTER TABLE `acct_sales_refunds`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_sales_returns`
--
ALTER TABLE `acct_sales_returns`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_sales_return_lines`
--
ALTER TABLE `acct_sales_return_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_scenario_assumptions`
--
ALTER TABLE `acct_scenario_assumptions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_sessions`
--
ALTER TABLE `acct_sessions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_shop_customers`
--
ALTER TABLE `acct_shop_customers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_shop_password_resets`
--
ALTER TABLE `acct_shop_password_resets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_shop_sessions`
--
ALTER TABLE `acct_shop_sessions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_staff_advances`
--
ALTER TABLE `acct_staff_advances`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_staff_advance_recoveries`
--
ALTER TABLE `acct_staff_advance_recoveries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_counts`
--
ALTER TABLE `acct_stock_counts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_count_lines`
--
ALTER TABLE `acct_stock_count_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_damages`
--
ALTER TABLE `acct_stock_damages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_drafts`
--
ALTER TABLE `acct_stock_drafts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_events`
--
ALTER TABLE `acct_stock_events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_movements`
--
ALTER TABLE `acct_stock_movements`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_reporters`
--
ALTER TABLE `acct_stock_reporters`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_transfers`
--
ALTER TABLE `acct_stock_transfers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_stock_transfer_lines`
--
ALTER TABLE `acct_stock_transfer_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_suppliers`
--
ALTER TABLE `acct_suppliers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_supplier_refunds`
--
ALTER TABLE `acct_supplier_refunds`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_supplier_returns`
--
ALTER TABLE `acct_supplier_returns`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_supplier_return_lines`
--
ALTER TABLE `acct_supplier_return_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_supplier_return_replacements`
--
ALTER TABLE `acct_supplier_return_replacements`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_user_access`
--
ALTER TABLE `acct_user_access`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_whatsapp_outbox`
--
ALTER TABLE `acct_whatsapp_outbox`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_whatsapp_recipients`
--
ALTER TABLE `acct_whatsapp_recipients`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `acct_whatsapp_subscriptions`
--
ALTER TABLE `acct_whatsapp_subscriptions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `acct_advances`
--
ALTER TABLE `acct_advances`
  ADD CONSTRAINT `fk_advance_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_advance_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_advance_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_advance_transactions`
--
ALTER TABLE `acct_advance_transactions`
  ADD CONSTRAINT `fk_advance_tx_advance` FOREIGN KEY (`legal_business_id`,`advance_id`) REFERENCES `acct_advances` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_advance_tx_bank` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_advance_tx_cash` FOREIGN KEY (`cash_account_id`) REFERENCES `acct_cash_accounts` (`id`),
  ADD CONSTRAINT `fk_advance_tx_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_advance_tx_funding` FOREIGN KEY (`legal_business_id`,`funding_party_id`) REFERENCES `acct_funding_parties` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_agreement_amendments`
--
ALTER TABLE `acct_agreement_amendments`
  ADD CONSTRAINT `fk_amend_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_amend_from` FOREIGN KEY (`from_version_id`) REFERENCES `acct_agreement_versions` (`id`),
  ADD CONSTRAINT `fk_amend_requester` FOREIGN KEY (`requested_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_amend_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_amend_to` FOREIGN KEY (`to_version_id`) REFERENCES `acct_agreement_versions` (`id`);

--
-- Constraints for table `acct_agreement_funding_policies`
--
ALTER TABLE `acct_agreement_funding_policies`
  ADD CONSTRAINT `fk_policy_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_policy_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_policy_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`);

--
-- Constraints for table `acct_agreement_versions`
--
ALTER TABLE `acct_agreement_versions`
  ADD CONSTRAINT `fk_version_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_version_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_version_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_audit_events`
--
ALTER TABLE `acct_audit_events`
  ADD CONSTRAINT `acct_audit_events_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_audit_events_ibfk_2` FOREIGN KEY (`actor_user_id`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_bank_accounts`
--
ALTER TABLE `acct_bank_accounts`
  ADD CONSTRAINT `fk_bank_account_gl` FOREIGN KEY (`legal_business_id`,`gl_account_id`) REFERENCES `acct_chart_of_accounts` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_bank_evidence`
--
ALTER TABLE `acct_bank_evidence`
  ADD CONSTRAINT `fk_bank_evidence_account` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`);

--
-- Constraints for table `acct_bank_verifications`
--
ALTER TABLE `acct_bank_verifications`
  ADD CONSTRAINT `fk_bank_verification_evidence` FOREIGN KEY (`evidence_document_id`) REFERENCES `acct_bank_evidence` (`id`),
  ADD CONSTRAINT `fk_bank_verify_account` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`);

--
-- Constraints for table `acct_branches`
--
ALTER TABLE `acct_branches`
  ADD CONSTRAINT `fk_branch_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_branch_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`);

--
-- Constraints for table `acct_business_documents`
--
ALTER TABLE `acct_business_documents`
  ADD CONSTRAINT `fk_acct_doc_agreement_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`),
  ADD CONSTRAINT `fk_acct_doc_funding_agreement` FOREIGN KEY (`legal_business_id`,`funding_agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_doc_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_doc_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`),
  ADD CONSTRAINT `fk_doc_person` FOREIGN KEY (`person_id`) REFERENCES `acct_business_people` (`id`),
  ADD CONSTRAINT `fk_doc_user` FOREIGN KEY (`uploaded_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_business_people`
--
ALTER TABLE `acct_business_people`
  ADD CONSTRAINT `fk_people_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_people_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`);

--
-- Constraints for table `acct_business_settings`
--
ALTER TABLE `acct_business_settings`
  ADD CONSTRAINT `fk_business_settings_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);

--
-- Constraints for table `acct_cash_accounts`
--
ALTER TABLE `acct_cash_accounts`
  ADD CONSTRAINT `fk_cash_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_cash_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_cash_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_cash_gl` FOREIGN KEY (`legal_business_id`,`gl_account_id`) REFERENCES `acct_chart_of_accounts` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_chart_of_accounts`
--
ALTER TABLE `acct_chart_of_accounts`
  ADD CONSTRAINT `fk_coa_new_parent` FOREIGN KEY (`legal_business_id`,`parent_account_id`) REFERENCES `acct_chart_of_accounts` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_customers`
--
ALTER TABLE `acct_customers`
  ADD CONSTRAINT `fk_customer_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);

--
-- Constraints for table `acct_divisions`
--
ALTER TABLE `acct_divisions`
  ADD CONSTRAINT `acct_divisions_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);

--
-- Constraints for table `acct_document_sequences`
--
ALTER TABLE `acct_document_sequences`
  ADD CONSTRAINT `fk_document_sequence_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);

--
-- Constraints for table `acct_expenses`
--
ALTER TABLE `acct_expenses`
  ADD CONSTRAINT `fk_expense_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_expense_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_expense_confirmer` FOREIGN KEY (`confirmed_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_expense_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_expense_payments`
--
ALTER TABLE `acct_expense_payments`
  ADD CONSTRAINT `fk_exp_pay_bank` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_exp_pay_cash` FOREIGN KEY (`cash_account_id`) REFERENCES `acct_cash_accounts` (`id`),
  ADD CONSTRAINT `fk_exp_pay_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_exp_pay_expense_business` FOREIGN KEY (`legal_business_id`,`expense_id`) REFERENCES `acct_expenses` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_exp_pay_funding_party` FOREIGN KEY (`legal_business_id`,`funding_party_id`) REFERENCES `acct_funding_parties` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_financial_scenarios`
--
ALTER TABLE `acct_financial_scenarios`
  ADD CONSTRAINT `acct_financial_scenarios_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_financial_scenarios_ibfk_2` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_financial_scenarios_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_financial_years`
--
ALTER TABLE `acct_financial_years`
  ADD CONSTRAINT `acct_financial_years_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);

--
-- Constraints for table `acct_funding_agreements`
--
ALTER TABLE `acct_funding_agreements`
  ADD CONSTRAINT `fk_agreement_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_agreement_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`),
  ADD CONSTRAINT `fk_agreement_party` FOREIGN KEY (`legal_business_id`,`party_id`) REFERENCES `acct_funding_parties` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_agreement_user` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_funding_agreement_branch` FOREIGN KEY (`branch_id`) REFERENCES `acct_branches` (`id`);

--
-- Constraints for table `acct_funding_parties`
--
ALTER TABLE `acct_funding_parties`
  ADD CONSTRAINT `fk_funding_party_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);

--
-- Constraints for table `acct_funding_transactions`
--
ALTER TABLE `acct_funding_transactions`
  ADD CONSTRAINT `fk_funding_tx_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_funding_tx_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_funding_tx_journal` FOREIGN KEY (`journal_entry_id`) REFERENCES `acct_journal_entries` (`id`),
  ADD CONSTRAINT `fk_funding_tx_user` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_funding_tx_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`);

--
-- Constraints for table `acct_historical_funding_batches`
--
ALTER TABLE `acct_historical_funding_batches`
  ADD CONSTRAINT `fk_historical_batch_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_historical_batch_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_historical_batch_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_historical_funding_items`
--
ALTER TABLE `acct_historical_funding_items`
  ADD CONSTRAINT `fk_historical_item_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_historical_item_batch` FOREIGN KEY (`legal_business_id`,`batch_id`) REFERENCES `acct_historical_funding_batches` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_historical_item_transaction` FOREIGN KEY (`imported_transaction_id`) REFERENCES `acct_funding_transactions` (`id`),
  ADD CONSTRAINT `fk_historical_item_version` FOREIGN KEY (`agreement_version_id`) REFERENCES `acct_agreement_versions` (`id`);

--
-- Constraints for table `acct_inventory_locations`
--
ALTER TABLE `acct_inventory_locations`
  ADD CONSTRAINT `fk_inventory_location_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_inventory_location_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_inventory_location_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_inventory_location_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);

--
-- Constraints for table `acct_investor_bank_scopes`
--
ALTER TABLE `acct_investor_bank_scopes`
  ADD CONSTRAINT `fk_ibs_bank` FOREIGN KEY (`bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_ibs_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_ibs_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_ibs_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_ibs_party` FOREIGN KEY (`funding_party_id`) REFERENCES `acct_funding_parties` (`id`);

--
-- Constraints for table `acct_journal_entries`
--
ALTER TABLE `acct_journal_entries`
  ADD CONSTRAINT `acct_journal_entries_ibfk_1` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_journal_entries_ibfk_2` FOREIGN KEY (`financial_year_id`,`legal_business_id`) REFERENCES `acct_financial_years` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_journal_entries_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_journal_period_business` FOREIGN KEY (`legal_business_id`,`accounting_period_id`) REFERENCES `acct_accounting_periods` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_journal_lines`
--
ALTER TABLE `acct_journal_lines`
  ADD CONSTRAINT `acct_journal_lines_ibfk_1` FOREIGN KEY (`journal_entry_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_journal_lines_ibfk_2` FOREIGN KEY (`account_id`,`legal_business_id`) REFERENCES `acct_chart_of_accounts` (`id`, `legal_business_id`),
  ADD CONSTRAINT `acct_journal_lines_ibfk_3` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_journal_line_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_journal_post_sequences`
--
ALTER TABLE `acct_journal_post_sequences`
  ADD CONSTRAINT `fk_journal_seq_fy` FOREIGN KEY (`financial_year_id`,`legal_business_id`) REFERENCES `acct_financial_years` (`id`, `legal_business_id`);

--
-- Constraints for table `acct_journal_reversals`
--
ALTER TABLE `acct_journal_reversals`
  ADD CONSTRAINT `fk_reversal_actor` FOREIGN KEY (`reversed_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_reversal_journal` FOREIGN KEY (`reversal_journal_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_reversal_original` FOREIGN KEY (`original_journal_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`);

--
-- Constraints for table `acct_offer_products`
--
ALTER TABLE `acct_offer_products`
  ADD CONSTRAINT `fk_offer_products_offer` FOREIGN KEY (`offer_id`) REFERENCES `acct_offers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `acct_online_order_lines`
--
ALTER TABLE `acct_online_order_lines`
  ADD CONSTRAINT `fk_online_line_order` FOREIGN KEY (`order_id`) REFERENCES `acct_online_orders` (`id`);

--
-- Constraints for table `acct_opening_balance_authorizations`
--
ALTER TABLE `acct_opening_balance_authorizations`
  ADD CONSTRAINT `fk_oba_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_oba_batch` FOREIGN KEY (`legal_business_id`,`batch_id`) REFERENCES `acct_opening_balance_batches` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_oba_revoker` FOREIGN KEY (`revoked_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_opening_balance_batches`
--
ALTER TABLE `acct_opening_balance_batches`
  ADD CONSTRAINT `fk_opening_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_opening_fy` FOREIGN KEY (`financial_year_id`,`legal_business_id`) REFERENCES `acct_financial_years` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_opening_journal` FOREIGN KEY (`posted_journal_id`,`legal_business_id`) REFERENCES `acct_journal_entries` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_opening_period` FOREIGN KEY (`legal_business_id`,`accounting_period_id`) REFERENCES `acct_accounting_periods` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_opening_balance_lines`
--
ALTER TABLE `acct_opening_balance_lines`
  ADD CONSTRAINT `fk_opening_line_account` FOREIGN KEY (`account_id`,`legal_business_id`) REFERENCES `acct_chart_of_accounts` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_opening_line_batch` FOREIGN KEY (`legal_business_id`,`batch_id`) REFERENCES `acct_opening_balance_batches` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_opening_line_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_opening_line_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);

--
-- Constraints for table `acct_opening_funding_details`
--
ALTER TABLE `acct_opening_funding_details`
  ADD CONSTRAINT `fk_ofd_line` FOREIGN KEY (`legal_business_id`,`opening_line_id`) REFERENCES `acct_opening_balance_lines` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_ofd_party` FOREIGN KEY (`funding_party_id`) REFERENCES `acct_funding_parties` (`id`),
  ADD CONSTRAINT `fk_opening_funding_agreement` FOREIGN KEY (`agreement_id`) REFERENCES `acct_funding_agreements` (`id`);

--
-- Constraints for table `acct_products`
--
ALTER TABLE `acct_products`
  ADD CONSTRAINT `fk_product_category` FOREIGN KEY (`legal_business_id`,`division_id`,`category_id`) REFERENCES `acct_product_categories` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_product_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_product_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);

--
-- Constraints for table `acct_product_categories`
--
ALTER TABLE `acct_product_categories`
  ADD CONSTRAINT `fk_category_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_category_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_category_parent` FOREIGN KEY (`legal_business_id`,`division_id`,`parent_category_id`) REFERENCES `acct_product_categories` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_product_variants`
--
ALTER TABLE `acct_product_variants`
  ADD CONSTRAINT `fk_variant_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_variant_product` FOREIGN KEY (`legal_business_id`,`division_id`,`product_id`) REFERENCES `acct_products` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_profit_allocations`
--
ALTER TABLE `acct_profit_allocations`
  ADD CONSTRAINT `fk_profit_allocation_agreement` FOREIGN KEY (`legal_business_id`,`agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_profit_allocation_approver` FOREIGN KEY (`approved_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_profit_allocation_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`);

--
-- Constraints for table `acct_profit_waterfall_policies`
--
ALTER TABLE `acct_profit_waterfall_policies`
  ADD CONSTRAINT `fk_waterfall_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_waterfall_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_waterfall_division` FOREIGN KEY (`division_id`) REFERENCES `acct_divisions` (`id`);

--
-- Constraints for table `acct_purchase_headers`
--
ALTER TABLE `acct_purchase_headers`
  ADD CONSTRAINT `fk_purchase_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_purchase_division` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`),
  ADD CONSTRAINT `fk_purchase_location` FOREIGN KEY (`legal_business_id`,`receiving_location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_purchase_poster` FOREIGN KEY (`posted_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_purchase_supplier` FOREIGN KEY (`legal_business_id`,`supplier_id`) REFERENCES `acct_suppliers` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_purchase_lines`
--
ALTER TABLE `acct_purchase_lines`
  ADD CONSTRAINT `fk_purchase_line_header` FOREIGN KEY (`legal_business_id`,`division_id`,`purchase_id`) REFERENCES `acct_purchase_headers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_purchase_line_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_purchase_payments`
--
ALTER TABLE `acct_purchase_payments`
  ADD CONSTRAINT `fk_pp_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_pp_funding_agreement` FOREIGN KEY (`legal_business_id`,`funding_agreement_id`) REFERENCES `acct_funding_agreements` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_pp_funding_party` FOREIGN KEY (`funding_party_id`) REFERENCES `acct_funding_parties` (`id`),
  ADD CONSTRAINT `fk_pp_journal` FOREIGN KEY (`journal_entry_id`) REFERENCES `acct_journal_entries` (`id`),
  ADD CONSTRAINT `fk_pp_purchase` FOREIGN KEY (`legal_business_id`,`division_id`,`purchase_id`) REFERENCES `acct_purchase_headers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_pp_source_bank` FOREIGN KEY (`source_bank_account_id`) REFERENCES `acct_bank_accounts` (`id`),
  ADD CONSTRAINT `fk_pp_source_cash` FOREIGN KEY (`source_cash_account_id`) REFERENCES `acct_cash_accounts` (`id`),
  ADD CONSTRAINT `fk_pp_verifier` FOREIGN KEY (`verified_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_sales_headers`
--
ALTER TABLE `acct_sales_headers`
  ADD CONSTRAINT `fk_sales_branch` FOREIGN KEY (`legal_business_id`,`division_id`,`branch_id`) REFERENCES `acct_branches` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_sales_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_sales_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_sales_location` FOREIGN KEY (`legal_business_id`,`location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_sales_poster` FOREIGN KEY (`posted_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_sales_lines`
--
ALTER TABLE `acct_sales_lines`
  ADD CONSTRAINT `fk_sales_line_header` FOREIGN KEY (`legal_business_id`,`division_id`,`sale_id`) REFERENCES `acct_sales_headers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_sales_line_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_sales_payments`
--
ALTER TABLE `acct_sales_payments`
  ADD CONSTRAINT `fk_sales_payment_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_sales_payment_header` FOREIGN KEY (`legal_business_id`,`division_id`,`sale_id`) REFERENCES `acct_sales_headers` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_scenario_assumptions`
--
ALTER TABLE `acct_scenario_assumptions`
  ADD CONSTRAINT `acct_scenario_assumptions_ibfk_1` FOREIGN KEY (`scenario_id`) REFERENCES `acct_financial_scenarios` (`id`);

--
-- Constraints for table `acct_sessions`
--
ALTER TABLE `acct_sessions`
  ADD CONSTRAINT `fk_acct_session_user` FOREIGN KEY (`user_id`) REFERENCES `acct_app_users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `acct_shop_password_resets`
--
ALTER TABLE `acct_shop_password_resets`
  ADD CONSTRAINT `fk_shop_reset_customer` FOREIGN KEY (`customer_id`) REFERENCES `acct_shop_customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `acct_shop_sessions`
--
ALTER TABLE `acct_shop_sessions`
  ADD CONSTRAINT `fk_shop_session_customer` FOREIGN KEY (`customer_id`) REFERENCES `acct_shop_customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `acct_stock_movements`
--
ALTER TABLE `acct_stock_movements`
  ADD CONSTRAINT `fk_stock_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_stock_location` FOREIGN KEY (`legal_business_id`,`location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_stock_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_stock_transfers`
--
ALTER TABLE `acct_stock_transfers`
  ADD CONSTRAINT `fk_transfer_created_by` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_transfer_dispatched_by` FOREIGN KEY (`dispatched_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_transfer_from_location` FOREIGN KEY (`legal_business_id`,`from_location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`),
  ADD CONSTRAINT `fk_transfer_received_by` FOREIGN KEY (`received_by`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `fk_transfer_to_location` FOREIGN KEY (`legal_business_id`,`to_location_id`) REFERENCES `acct_inventory_locations` (`legal_business_id`, `id`);

--
-- Constraints for table `acct_stock_transfer_lines`
--
ALTER TABLE `acct_stock_transfer_lines`
  ADD CONSTRAINT `fk_transfer_line_header` FOREIGN KEY (`legal_business_id`,`division_id`,`transfer_id`) REFERENCES `acct_stock_transfers` (`legal_business_id`, `division_id`, `id`),
  ADD CONSTRAINT `fk_transfer_line_variant` FOREIGN KEY (`legal_business_id`,`division_id`,`variant_id`) REFERENCES `acct_product_variants` (`legal_business_id`, `division_id`, `id`);

--
-- Constraints for table `acct_suppliers`
--
ALTER TABLE `acct_suppliers`
  ADD CONSTRAINT `fk_supplier_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_supplier_creator` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_user_access`
--
ALTER TABLE `acct_user_access`
  ADD CONSTRAINT `acct_user_access_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `acct_app_users` (`id`),
  ADD CONSTRAINT `acct_user_access_ibfk_2` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `acct_user_access_ibfk_3` FOREIGN KEY (`division_id`,`legal_business_id`) REFERENCES `acct_divisions` (`id`, `legal_business_id`);

--
-- Constraints for table `acct_whatsapp_outbox`
--
ALTER TABLE `acct_whatsapp_outbox`
  ADD CONSTRAINT `fk_wa_outbox_sub` FOREIGN KEY (`subscription_id`) REFERENCES `acct_whatsapp_subscriptions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `acct_whatsapp_recipients`
--
ALTER TABLE `acct_whatsapp_recipients`
  ADD CONSTRAINT `fk_wa_recipient_business` FOREIGN KEY (`legal_business_id`) REFERENCES `acct_legal_businesses` (`id`),
  ADD CONSTRAINT `fk_wa_recipient_user` FOREIGN KEY (`created_by`) REFERENCES `acct_app_users` (`id`);

--
-- Constraints for table `acct_whatsapp_subscriptions`
--
ALTER TABLE `acct_whatsapp_subscriptions`
  ADD CONSTRAINT `fk_wa_sub_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `acct_whatsapp_recipients` (`id`) ON DELETE CASCADE;

--