# Screen catalogue

Every page.tsx in the checkout is listed below. Extracted from source, not browser screenshots. Dynamic headings, conditional fields and imported forms require runtime verification. Role columns describe navigation policy; server guards and row scope must be verified separately. Table references include local transitive imports and can therefore be broader than a screen’s direct query.

## Money in bank and cash

- Route: `/accounting/account-balances`
- Source: [src/app/(workspace)/accounting/account-balances/page.tsx](../../src/app/(workspace)/accounting/account-balances/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Where the money is and how it moved
- Static headings: Account Balances & Money Flow; Account Summary
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("reports")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_bank_accounts`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_posting_failures`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Advances and deposits

- Route: `/accounting/advances-deposits`
- Source: [src/app/(workspace)/accounting/advances-deposits/page.tsx](../../src/app/(workspace)/accounting/advances-deposits/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Money paid in advance or as deposit
- Static headings: Advance & Deposit Register; Advances & Refundable Deposits
- Named form controls (including imported UI): `advance_date`, `advance_type`, `allocation_level`, `amount`, `branch_id`, `description`, `division_id`, `funding_party_id`, `payment_account`, `payment_method`, `payment_reference`, `payment_source`, `recipient_name`, `remarks`
- Direct guard calls: requireAccess("expenses")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_document_sequences`, `acct_funding_parties`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Items on approval

- Route: `/accounting/approval-items`
- Source: [src/app/(workspace)/accounting/approval-items/page.tsx](../../src/app/(workspace)/accounting/approval-items/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Customer takes items home to try, pays only for what they keep
- Static headings: Earlier results; Hand out items; Items on approval
- Named form controls (including imported UI): `customer_name`, `customer_phone`, `expected_back`, `handed_date`, `item_id`, `location`, `location_id`, `outcome`, `q`, `quantity`, `remarks`
- Direct guard calls: requireAccess("approval_items")
- Direct action imports: `@/lib/approval-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_approval_handouts`, `acct_approval_items`, `acct_audit_events`, `acct_cash_accounts`, `acct_customers`, `acct_inventory_locations`, `acct_legal_businesses`, `acct_product_variants`, `acct_products`, `acct_sales_headers`, `acct_sales_payments`, `acct_sessions`, `acct_stock_damages`, `acct_stock_movements`, `acct_user_access`

## Change history

- Route: `/accounting/audit/changes`
- Source: [src/app/(workspace)/accounting/audit/changes/page.tsx](../../src/app/(workspace)/accounting/audit/changes/page.tsx)
- Access: GROUP_OWNER, AUDITOR
- Purpose: Who did what, and when
- Static headings: Change history
- Named form controls (including imported UI): `from`, `to`, `what`, `who`
- Direct guard calls: requireAccess("audit_view")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_sessions`, `acct_user_access`

## Download for the auditor

- Route: `/accounting/audit/export`
- Source: [src/app/(workspace)/accounting/audit/export/page.tsx](../../src/app/(workspace)/accounting/audit/export/page.tsx)
- Access: GROUP_OWNER, AUDITOR
- Purpose: Excel and Tally files of the books
- Static headings: Download for the auditor; Excel; Tally
- Named form controls (including imported UI): `format`, `from`, `to`
- Direct guard calls: requireAccess("audit_view")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_financial_years`, `acct_sessions`, `acct_user_access`

## Every ledger line

- Route: `/accounting/audit/ledger`
- Source: [src/app/(workspace)/accounting/audit/ledger/page.tsx](../../src/app/(workspace)/accounting/audit/ledger/page.tsx)
- Access: GROUP_OWNER, AUDITOR
- Purpose: Search every posted entry by date, account or words (view only)
- Static headings: Every ledger line
- Named form controls (including imported UI): `account`, `from`, `q`, `source`, `to`
- Direct guard calls: requireAccess("audit_view")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_chart_of_accounts`, `acct_financial_years`, `acct_journal_entries`, `acct_journal_lines`, `acct_sessions`, `acct_user_access`

## Auditor adjustments

- Route: `/accounting/auditor-adjustments`
- Source: [src/app/(workspace)/accounting/auditor-adjustments/page.tsx](../../src/app/(workspace)/accounting/auditor-adjustments/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Record a change your auditor asked for, as its own dated entry
- Static headings: Auditor adjustments; Earlier adjustments; Lines
- Named form controls (including imported UI): `adj_branch`, `adj_division`, `entry_date`, `reason`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/auditor-adjustment-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_auditor_adjustments`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_divisions`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_product_variants`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Backup

- Route: `/accounting/backup`
- Source: [src/app/(workspace)/accounting/backup/page.tsx](../../src/app/(workspace)/accounting/backup/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Download a full copy of your accounting data
- Static headings: Backup; Documents and photos; If you ever need to restore
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_sessions`, `acct_user_access`

## Bank accounts

- Route: `/accounting/bank-accounts`
- Source: [src/app/(workspace)/accounting/bank-accounts/page.tsx](../../src/app/(workspace)/accounting/bank-accounts/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Add Bank Account; Bank Account Management; Registered Accounts
- Static headings: Add Bank Account; Bank Account Management; Registered Accounts
- Named form controls (including imported UI): `account_holder_name`, `account_label`, `account_number`, `account_type`, `bank_account_id`, `bank_name`, `branch_name`, `can_receive`, `can_send`, `decision`, `evidence_id`, `file`, `funding_party_id`, `gl_account_id`, `ifsc_code`, `notes`, `ownership_type`, `return_to`, `verification_notes`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/bank-account-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_bank_evidence`, `acct_bank_verifications`, `acct_chart_of_accounts`, `acct_funding_parties`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Bank statement check

- Route: `/accounting/bank-statement`
- Source: [src/app/(workspace)/accounting/bank-statement/page.tsx](../../src/app/(workspace)/accounting/bank-statement/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Upload your bank file and match it with the books
- Static headings: 1. Choose the bank account; 2. Upload the statement; 3. Result; Bank statement check; Ignored lines; In the bank, not in your books; In your books, not in the bank
- Named form controls (including imported UI): `bank_account_id`, `file`, `line_id`, `note`, `pasted`, `undo`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/bank-statement-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_bank_accounts`, `acct_bank_statement_lines`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_reversals`, `acct_sessions`, `acct_user_access`

## Bill terms

- Route: `/accounting/bill-terms`
- Source: [src/app/(workspace)/accounting/bill-terms/page.tsx](../../src/app/(workspace)/accounting/bill-terms/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Terms and conditions printed on every bill
- Static headings: Bill terms and conditions; How it prints
- Named form controls (including imported UI): `body`, `reset`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/bill-terms-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_bill_terms`, `acct_sales_headers`, `acct_sessions`, `acct_user_access`

## Cancel one against the other

- Route: `/accounting/both-sides/[supplierId]`
- Source: [src/app/(workspace)/accounting/both-sides/[supplierId]/page.tsx](../../src/app/(workspace)/accounting/both-sides/[supplierId]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Cancel one against the other; Earlier set-offs
- Static headings: Cancel one against the other; Earlier set-offs
- Named form controls (including imported UI): `amount`, `note`, `setoff_date`, `supplier_id`
- Direct guard calls: requireAccess("both_sides")
- Direct action imports: `@/lib/party-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_customers`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_product_variants`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Both sides (also a supplier)

- Route: `/accounting/both-sides`
- Source: [src/app/(workspace)/accounting/both-sides/page.tsx](../../src/app/(workspace)/accounting/both-sides/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: People who buy from us and sell to us: link them and set off
- Static headings: Both sides; Link a supplier and a customer; Looks like the same person; Not in the other list yet?; People who are both
- Named form controls (including imported UI): `customer_id`, `supplier_id`
- Direct guard calls: requireAccess("both_sides")
- Direct action imports: `@/lib/party-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_customers`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_product_variants`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## /accounting/branch-inventory

- Route: `/accounting/branch-inventory`
- Source: [src/app/(workspace)/accounting/branch-inventory/page.tsx](../../src/app/(workspace)/accounting/branch-inventory/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, DIVISION_MANAGER
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): None detected

## Cash accounts

- Route: `/accounting/cash-accounts`
- Source: [src/app/(workspace)/accounting/cash-accounts/page.tsx](../../src/app/(workspace)/accounting/cash-accounts/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Cash Account Management; Cash Account Register; Create Cash Account
- Static headings: Cash Account Management; Cash Account Register; Create Cash Account
- Named form controls (including imported UI): `branch_id`, `cash_name`, `cash_type`, `custodian_name`, `division_id`, `gl_account_code`, `notes`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/cash-account-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_divisions`, `acct_legal_businesses`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## Close the day (cash count)

- Route: `/accounting/cash-closing`
- Source: [src/app/(workspace)/accounting/cash-closing/page.tsx](../../src/app/(workspace)/accounting/cash-closing/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Count the cash drawer and compare with what the system expects
- Static headings: Close the day (cash count); Does the drawer match the books?; Earlier closings; Notes that should be in the drawer (amounts in ₹)
- Named form controls (including imported UI): `account`, `cash_account_id`, `closing_date`, `counted`, `date`, `denominations`, `note`, `opening`, `taken_out`, `taken_to`
- Direct guard calls: requireAccess("cash_closing")
- Direct action imports: `@/lib/cash-closing-actions`
- Referenced tables (dependency closure): `acct_advance_transactions`, `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_cash_closings`, `acct_cash_note_log`, `acct_chart_of_accounts`, `acct_divisions`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_fixed_assets`, `acct_funding_transactions`, `acct_inventory_locations`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_reversals`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_owner_accounts`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sessions`, `acct_staff_advances`, `acct_supplier_refunds`, `acct_user_access`

## Where the money went

- Route: `/accounting/cash-flow`
- Source: [src/app/(workspace)/accounting/cash-flow/page.tsx](../../src/app/(workspace)/accounting/cash-flow/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Money in and out of cash and bank, and what is left
- Static headings: Where it is now; Where the money went
- Named form controls (including imported UI): `from`, `to`
- Direct guard calls: requireAccess("reports")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_bank_accounts`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_financial_years`, `acct_journal_entries`, `acct_journal_lines`, `acct_sessions`, `acct_user_access`

## Add photos and videos

- Route: `/accounting/catalogue/[id]`
- Source: [src/app/(workspace)/accounting/catalogue/[id]/page.tsx](../../src/app/(workspace)/accounting/catalogue/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Add photos and videos; Message for WhatsApp or Instagram; Online details; Sizes, colours and stock
- Static headings: Add photos and videos; Message for WhatsApp or Instagram; Online details; Sizes, colours and stock
- Named form controls (including imported UI): `care_text`, `description`, `files`, `highlights`, `media_id`, `product_id`, `size_guide`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/shop-actions`, `@/lib/catalogue-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_business_settings`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_stock_events`, `acct_stock_movements`, `acct_user_access`

## /accounting/catalogue/broadcast/[id]

- Route: `/accounting/catalogue/broadcast/[id]`
- Source: [src/app/(workspace)/accounting/catalogue/broadcast/[id]/page.tsx](../../src/app/(workspace)/accounting/catalogue/broadcast/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_business_settings`, `acct_customers`, `acct_product_media`, `acct_products`, `acct_sessions`, `acct_stock_events`, `acct_user_access`, `acct_wa_broadcast_recipients`, `acct_wa_broadcasts`, `acct_wa_delivery`

## 1. Send a test to your own number

- Route: `/accounting/catalogue/broadcast`
- Source: [src/app/(workspace)/accounting/catalogue/broadcast/page.tsx](../../src/app/(workspace)/accounting/catalogue/broadcast/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: 1. Send a test to your own number; 2. Send to everyone on the list; Earlier sends; Send new stock on WhatsApp (automatic)
- Static headings: 1. Send a test to your own number; 2. Send to everyone on the list; Earlier sends; Send new stock on WhatsApp (automatic)
- Named form controls (including imported UI): `confirm`, `count`, `events`, `phone`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/broadcast-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_business_settings`, `acct_customers`, `acct_product_media`, `acct_products`, `acct_sessions`, `acct_stock_events`, `acct_user_access`, `acct_wa_broadcast_recipients`, `acct_wa_broadcasts`

## /accounting/catalogue/instagram

- Route: `/accounting/catalogue/instagram`
- Source: [src/app/(workspace)/accounting/catalogue/instagram/page.tsx](../../src/app/(workspace)/accounting/catalogue/instagram/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("products")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_instagram_posts`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_user_access`

## New stock arrivals

- Route: `/accounting/catalogue/new-stock`
- Source: [src/app/(workspace)/accounting/catalogue/new-stock/page.tsx](../../src/app/(workspace)/accounting/catalogue/new-stock/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Newly received stock, ready to announce
- Static headings: New stock arrivals
- Named form controls (including imported UI): `event_ids`, `status`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/catalogue-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_divisions`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_stock_events`, `acct_user_access`

## Catalogue

- Route: `/accounting/catalogue`
- Source: [src/app/(workspace)/accounting/catalogue/page.tsx](../../src/app/(workspace)/accounting/catalogue/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Photos and videos of every product
- Static headings: Catalogue
- Named form controls (including imported UI): `mode`, `q`, `view`, `whatsapp`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/shop-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_business_settings`, `acct_divisions`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Add photos

- Route: `/accounting/catalogue/photos`
- Source: [src/app/(workspace)/accounting/catalogue/photos/page.tsx](../../src/app/(workspace)/accounting/catalogue/photos/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Add photos
- Static headings: Add photos
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("products")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_product_media`, `acct_products`, `acct_sessions`, `acct_user_access`

## Shop prices

- Route: `/accounting/catalogue/prices`
- Source: [src/app/(workspace)/accounting/catalogue/prices/page.tsx](../../src/app/(workspace)/accounting/catalogue/prices/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Shop prices
- Static headings: Shop prices
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/shop-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Add a song

- Route: `/accounting/catalogue/reels/music`
- Source: [src/app/(workspace)/accounting/catalogue/reels/music/page.tsx](../../src/app/(workspace)/accounting/catalogue/reels/music/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Add a song; Music for reels
- Static headings: Add a song; Music for reels
- Named form controls (including imported UI): `file`, `id`, `licence`, `name`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/reel-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_reel_tracks`, `acct_sessions`, `acct_user_access`

## /accounting/catalogue/reels

- Route: `/accounting/catalogue/reels`
- Source: [src/app/(workspace)/accounting/catalogue/reels/page.tsx](../../src/app/(workspace)/accounting/catalogue/reels/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("products")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_reel_tracks`, `acct_selling_prices`, `acct_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Tell customers about new stock

- Route: `/accounting/catalogue/share`
- Source: [src/app/(workspace)/accounting/catalogue/share/page.tsx](../../src/app/(workspace)/accounting/catalogue/share/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Tell customers about new stock
- Static headings: Tell customers about new stock
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("customers")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_customer_messages`, `acct_customers`, `acct_divisions`, `acct_product_variants`, `acct_products`, `acct_sales_headers`, `acct_sessions`, `acct_stock_events`, `acct_user_access`

## Chart of accounts

- Route: `/accounting/chart-of-accounts`
- Source: [src/app/(workspace)/accounting/chart-of-accounts/page.tsx](../../src/app/(workspace)/accounting/chart-of-accounts/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: The list of accounts
- Static headings: Chart of Accounts; Create Ledger Account; Ledger Accounts
- Named form controls (including imported UI): `account_id`, `account_name`, `account_subtype`, `account_type`, `description`, `q`, `requires_branch`, `requires_division`, `status`, `target_status`, `type`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/chart-of-accounts-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_chart_of_accounts`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## WhatsApp message log

- Route: `/accounting/chatbot/log`
- Source: [src/app/(workspace)/accounting/chatbot/log/page.tsx](../../src/app/(workspace)/accounting/chatbot/log/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER
- Purpose: Where each bill or photo message stopped
- Static headings: WhatsApp message log
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("online_orders")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_sales_headers`, `acct_sessions`, `acct_user_access`, `acct_wa_broadcast_recipients`, `acct_wa_broadcasts`, `acct_wa_delivery`, `acct_wa_status_log`

## WhatsApp chatbot

- Route: `/accounting/chatbot`
- Source: [src/app/(workspace)/accounting/chatbot/page.tsx](../../src/app/(workspace)/accounting/chatbot/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER
- Purpose: Quick answers, chats that need a person
- Static headings: New-stock messages to customers (automatic); Questions the bot could not answer; Send bills automatically; Status; Welcome message with shop details and photos; WhatsApp chatbot
- Named form controls (including imported UI): `auto`, `daily_max`, `details`, `enabled`, `id`, `keywords`, `language`, `owner_numbers`, `photos`, `rate`, `reply`, `template`, `title`, `welcome`
- Direct guard calls: requireAccess("online_orders")
- Direct action imports: `@/lib/broadcast-actions`, `@/lib/bot-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bot_answers`, `acct_bot_conversations`, `acct_bot_messages`, `acct_business_settings`, `acct_customers`, `acct_product_media`, `acct_products`, `acct_sessions`, `acct_stock_events`, `acct_user_access`, `acct_wa_broadcast_recipients`, `acct_wa_broadcasts`

## Who owes, and how long

- Route: `/accounting/customer-ageing`
- Source: [src/app/(workspace)/accounting/customer-ageing/page.tsx](../../src/app/(workspace)/accounting/customer-ageing/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Unpaid bills by age, with a WhatsApp reminder
- Static headings: Who owes us, and for how long
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("customers")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_customers`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Bills and payments

- Route: `/accounting/customers/[id]`
- Source: [src/app/(workspace)/accounting/customers/[id]/page.tsx](../../src/app/(workspace)/accounting/customers/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Bills and payments; Customer details; History
- Static headings: Bills and payments; Customer details; History
- Named form controls (including imported UI): `address`, `city`, `credit_limit`, `customer_id`, `customer_type`, `follow_up_on`, `full_name`, `gstin`, `kind`, `note`, `notes`, `phone`, `source_id`, `target_id`, `whatsapp_opt_in`
- Direct guard calls: requireAccess("customers")
- Direct action imports: `@/lib/customer-actions`, `@/lib/customer-merge-actions`, `@/lib/customer-note-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_approval_handouts`, `acct_approval_items`, `acct_audit_events`, `acct_bot_conversations`, `acct_bot_messages`, `acct_branches`, `acct_coupons`, `acct_customer_messages`, `acct_customer_notes`, `acct_customers`, `acct_divisions`, `acct_free_stock`, `acct_online_orders`, `acct_product_variants`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sale_rewards`, `acct_sales_headers`, `acct_sales_payments`, `acct_sales_returns`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## All customers

- Route: `/accounting/customers`
- Source: [src/app/(workspace)/accounting/customers/page.tsx](../../src/app/(workspace)/accounting/customers/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Customer list, history and credit limits
- Static headings: Add a customer; Customers
- Named form controls (including imported UI): `city`, `customer_type`, `full_name`, `phone`, `q`, `view`, `whatsapp_opt_in`
- Direct guard calls: requireAccess("customers")
- Direct action imports: `@/lib/customer-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_customers`, `acct_product_variants`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Cut-over check by agreement

- Route: `/accounting/cutover-reconciliation/agreements`
- Source: [src/app/(workspace)/accounting/cutover-reconciliation/agreements/page.tsx](../../src/app/(workspace)/accounting/cutover-reconciliation/agreements/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: One-time set-up
- Static headings: Agreement Cutover Reconciliation; Agreement Reconciliation; Agreement-Level Cutover Reconciliation; Investor Funding Reconciliation; Reconciliation Interpretation; Unlinked Opening Funding
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_agreement_funding_policies`, `acct_agreement_versions`, `acct_app_users`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_journal_entries`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_funding_details`, `acct_sessions`, `acct_user_access`

## Cut-over check

- Route: `/accounting/cutover-reconciliation`
- Source: [src/app/(workspace)/accounting/cutover-reconciliation/page.tsx](../../src/app/(workspace)/accounting/cutover-reconciliation/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: One-time set-up
- Static headings: Agreement-wise Reconciliation; Consolidated Funding Summary; Historical Cutover Reconciliation; Reconciliation Status
- Named form controls (including imported UI): `cutover`
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_journal_entries`, `acct_opening_balance_batches`, `acct_sessions`, `acct_user_access`

## Sales pipeline

- Route: `/accounting/deals`
- Source: [src/app/(workspace)/accounting/deals/page.tsx](../../src/app/(workspace)/accounting/deals/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Bigger or wholesale deals, from enquiry to won
- Static headings: Closed in the last 90 days; Sales pipeline
- Named form controls (including imported UI): `deal_id`, `expected_close`, `expected_value`, `lost_reason`, `note`, `party_name`, `phone`, `title`, `to`
- Direct guard calls: requireAccess("customers")
- Direct action imports: `@/lib/deal-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_customers`, `acct_deals`, `acct_sessions`, `acct_user_access`

## /accounting/documents/[id]

- Route: `/accounting/documents/[id]`
- Source: [src/app/(workspace)/accounting/documents/[id]/page.tsx](../../src/app/(workspace)/accounting/documents/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("reports")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_document_copies`, `acct_sessions`, `acct_user_access`

## Printed papers

- Route: `/accounting/documents`
- Source: [src/app/(workspace)/accounting/documents/page.tsx](../../src/app/(workspace)/accounting/documents/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Who printed which bill or voucher, reprints with reasons, saved copies
- Static headings: Printed papers
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("reports")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_document_log`, `acct_sessions`, `acct_user_access`

## Add Payment

- Route: `/accounting/expenses/[id]`
- Source: [src/app/(workspace)/accounting/expenses/[id]/page.tsx](../../src/app/(workspace)/accounting/expenses/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Add Payment; Payment History
- Static headings: Add Payment; Payment History
- Named form controls (including imported UI): `account_id`, `amount`, `branch_id`, `expense_id`, `funding_party_id`, `owner_account_id`, `payment_date`, `payment_id`, `payment_method`, `payment_reference`, `payment_source`
- Direct guard calls: requireAccess("expenses")
- Direct action imports: `@/lib/expense-payment-actions`, `@/lib/voucher-actions`, `@/lib/expense-branch-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_expense_payments`, `acct_expenses`, `acct_funding_parties`, `acct_journal_entries`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_owner_accounts`, `acct_sessions`, `acct_user_access`, `acct_vouchers`

## /accounting/expenses/[id]/print

- Route: `/accounting/expenses/[id]/print`
- Source: [src/app/(workspace)/accounting/expenses/[id]/print/page.tsx](../../src/app/(workspace)/accounting/expenses/[id]/print/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("expenses")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_document_copies`, `acct_document_log`, `acct_expense_payments`, `acct_expenses`, `acct_funding_parties`, `acct_sales_headers`, `acct_sessions`, `acct_user_access`, `acct_vouchers`

## Expenses

- Route: `/accounting/expenses`
- Source: [src/app/(workspace)/accounting/expenses/page.tsx](../../src/app/(workspace)/accounting/expenses/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Rent, salaries, transport and other costs
- Static headings: Expense Register; Expenses; New Expense
- Named form controls (including imported UI): `allocation_level`, `amount`, `branch_id`, `category`, `description`, `division_id`, `expense_date`, `initial_funding_party_id`, `initial_paid_amount`, `initial_payment_account`, `initial_payment_date`, `initial_payment_method`, `initial_payment_reference`, `initial_payment_source`, `is_setup_cost`, `mode`, `payee_name`, `remarks`
- Direct guard calls: requireAccess("expenses")
- Direct action imports: `@/lib/expense-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_document_sequences`, `acct_expense_payments`, `acct_expenses`, `acct_funding_parties`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Fixed assets

- Route: `/accounting/fixed-assets`
- Source: [src/app/(workspace)/accounting/fixed-assets/page.tsx](../../src/app/(workspace)/accounting/fixed-assets/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Shop fittings, machines, computers: cost, yearly wear and value now
- Static headings: Add an asset; Fixed assets; Monthly depreciation
- Named form controls (including imported UI): `asset_id`, `asset_name`, `category`, `cost`, `disposed_on`, `into`, `kind`, `life_years`, `note`, `paid_from`, `proceeds`, `purchase_date`, `remarks`, `salvage_value`, `up_to`
- Direct guard calls: requireAccess("expenses")
- Direct action imports: `@/lib/asset-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_fixed_assets`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## Follow-ups

- Route: `/accounting/follow-ups`
- Source: [src/app/(workspace)/accounting/follow-ups/page.tsx](../../src/app/(workspace)/accounting/follow-ups/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Who to call or message today
- Static headings: Follow-ups
- Named form controls (including imported UI): `id`, `mode`, `next_day`, `result`, `type`
- Direct guard calls: requireAccess("customers")
- Direct action imports: `@/lib/follow-up-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_customer_notes`, `acct_customers`, `acct_leads`, `acct_sessions`, `acct_user_access`

## Give stock free

- Route: `/accounting/free-stock`
- Source: [src/app/(workspace)/accounting/free-stock/page.tsx](../../src/app/(workspace)/accounting/free-stock/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Gifts, samples and promotions (a business expense)
- Static headings: 1. Where is the stock?; Earlier entries; Give stock free
- Named form controls (including imported UI): `customer_id`, `entry_id`, `given_date`, `given_to`, `location`, `location_id`, `q`, `reason`, `reject_reason`
- Direct guard calls: requireAccess("free_stock")
- Direct action imports: `@/lib/free-stock-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_cash_accounts`, `acct_customers`, `acct_free_stock`, `acct_free_stock_lines`, `acct_inventory_locations`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_stock_damages`, `acct_stock_movements`, `acct_user_access`

## Group rules

- Route: `/accounting/group-rules`
- Source: [src/app/(workspace)/accounting/group-rules/page.tsx](../../src/app/(workspace)/accounting/group-rules/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Least share you keep; funding limits
- Static headings: Funding limits; Group rules; Your share of the group
- Named form controls (including imported UI): `owner_min`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/group-rules-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_business_settings`, `acct_sessions`, `acct_user_access`

## GST settings

- Route: `/accounting/gst-settings`
- Source: [src/app/(workspace)/accounting/gst-settings/page.tsx](../../src/app/(workspace)/accounting/gst-settings/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Not registered yet; keeps the app ready
- Static headings: GST settings; Product tax details; Registration
- Named form controls (including imported UI): `effective_date`, `gstin`, `inclusive`, `state_code`, `status`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/gst-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_business_settings`, `acct_products`, `acct_sessions`, `acct_user_access`

## Accounting health

- Route: `/accounting/health`
- Source: [src/app/(workspace)/accounting/health/page.tsx](../../src/app/(workspace)/accounting/health/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Is everything in the books? What is waiting and why
- Static headings: Accounting health; Cash and bank: records against the books; Could not be posted; Database files; Opening balances; Safety checks; Skipped or needing review, and why; Stock against the books; Waiting to be posted
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("reports")
- Direct action imports: `@/lib/posting-retry-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_approval_items`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_auditor_adjustments`, `acct_bank_accounts`, `acct_bank_statement_lines`, `acct_bot_answers`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_closings`, `acct_cash_note_log`, `acct_chart_of_accounts`, `acct_customer_messages`, `acct_customer_notes`, `acct_customers`, `acct_deals`, `acct_divisions`, `acct_document_log`, `acct_employee_pay_history`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_instagram_posts`, `acct_invoice_shares`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_leads`, `acct_login_attempts`, `acct_offers`, `acct_online_orders`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_owner_accounts`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_posting_failures`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_orders`, `acct_purchase_payments`, `acct_reel_tracks`, `acct_sale_rewards`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_selling_prices`, `acct_serials`, `acct_sessions`, `acct_shop_customers`, `acct_shop_email_verifications`, `acct_shop_password_resets`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_stock_movements`, `acct_stock_reporters`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`, `acct_user_totp`, `acct_vouchers`, `acct_wa_broadcasts`, `acct_wa_status_log`, `acct_whatsapp_recipients`

## Earlier funding entries

- Route: `/accounting/historical-funding`
- Source: [src/app/(workspace)/accounting/historical-funding/page.tsx](../../src/app/(workspace)/accounting/historical-funding/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: One-time set-up
- Static headings: Create Historical Funding Batch; Draft Funding Summary; Funding Batches; Historical Funding Entry; Saved Historical Transactions
- Named form controls (including imported UI): `agreement_id`, `agreement_version_id`, `amount`, `batch_id`, `description`, `evidence_reference`, `payment_method`, `payment_reference`, `remarks`, `transaction_date`, `transaction_type`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/historical-funding-actions`
- Referenced tables (dependency closure): `acct_agreement_versions`, `acct_app_users`, `acct_audit_events`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_historical_funding_batches`, `acct_historical_funding_items`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_sessions`, `acct_user_access`

## Insights

- Route: `/accounting/insights`
- Source: [src/app/(workspace)/accounting/insights/page.tsx](../../src/app/(workspace)/accounting/insights/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Best sellers, who owes, slow stock, what is about to run out
- Static headings: About to run out; Best sellers this week; Cash coming and going; Customers; Each branch, last 30 days; Good customers who have gone quiet (no bill for 60 days); Insights; Sales; Slow movers (in stock, not sold for 60 days); Stock; Who owes you money
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("reports")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_advance_transactions`, `acct_app_users`, `acct_bank_accounts`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_customers`, `acct_divisions`, `acct_expense_payments`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_product_variants`, `acct_products`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_returns`, `acct_sessions`, `acct_stock_movements`, `acct_user_access`

## Investor money by account

- Route: `/accounting/investment-accounts`
- Source: [src/app/(workspace)/accounting/investment-accounts/page.tsx](../../src/app/(workspace)/accounting/investment-accounts/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Investor funds and what was spent from them
- Static headings: Agreement-wise Investment Balances; Investment Account Balances; Investor-Paid Supplier Purchases
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_bank_accounts`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_posting_failures`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Investor bank links

- Route: `/accounting/investor-bank-scopes`
- Source: [src/app/(workspace)/accounting/investor-bank-scopes/page.tsx](../../src/app/(workspace)/accounting/investor-bank-scopes/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: One-time set-up
- Static headings: Create Investor Bank Mapping; Investor Bank Mappings; Investor Bank Scope Mapping
- Named form controls (including imported UI): `bank_account_id`, `branch_id`, `division_id`, `funding_party_id`, `purpose`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/investor-bank-scope-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_divisions`, `acct_funding_parties`, `acct_investor_bank_scopes`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Change investor scope

- Route: `/accounting/investor-scope-amendment`
- Source: [src/app/(workspace)/accounting/investor-scope-amendment/page.tsx](../../src/app/(workspace)/accounting/investor-scope-amendment/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: One-time set-up
- Static headings: Approve Pending Amendment; Investor Agreement Scope Amendment
- Named form controls (including imported UI): `confirm`, `effective_from`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/investor-scope-amendment-actions`, `@/lib/investor-scope-approval-actions`
- Referenced tables (dependency closure): `acct_agreement_amendments`, `acct_agreement_funding_policies`, `acct_agreement_versions`, `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_funding_agreements`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Profit shares

- Route: `/accounting/investor-shares`
- Source: [src/app/(workspace)/accounting/investor-shares/page.tsx](../../src/app/(workspace)/accounting/investor-shares/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: What each investor has earned
- Static headings: By agreement; Investor Profit Shares
- Named form controls (including imported UI): `from`, `to`
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_advance_transactions`, `acct_agreement_versions`, `acct_app_users`, `acct_bank_accounts`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_divisions`, `acct_expense_payments`, `acct_financial_years`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_profit_waterfall_policies`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sessions`, `acct_user_access`

## Invoices

- Route: `/accounting/invoices`
- Source: [src/app/(workspace)/accounting/invoices/page.tsx](../../src/app/(workspace)/accounting/invoices/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Find, view and print past bills
- Static headings: Invoices & Payments
- Named form controls (including imported UI): `q`, `tab`
- Direct guard calls: requireAccess("sales")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_inventory_locations`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sessions`, `acct_user_access`

## Debit and Credit Lines

- Route: `/accounting/journals/[id]`
- Source: [src/app/(workspace)/accounting/journals/[id]/page.tsx](../../src/app/(workspace)/accounting/journals/[id]/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Debit and Credit Lines; Journal Details; Journal Information; Journal Reversal
- Static headings: Debit and Credit Lines; Journal Details; Journal Information; Journal Reversal
- Named form controls (including imported UI): `accounting_period_id`, `confirm`, `original_journal_id`, `reversal_date`, `reversal_reason`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/journal-reversal-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_chart_of_accounts`, `acct_divisions`, `acct_financial_years`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Journals

- Route: `/accounting/journals`
- Source: [src/app/(workspace)/accounting/journals/page.tsx](../../src/app/(workspace)/accounting/journals/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Every accounting entry
- Static headings: Create Draft Journal; Debit / Credit Lines; Journal Entries; Recent Journal Register
- Named form controls (including imported UI): `accounting_period_id`, `confirm`, `description`, `entry_date`, `financial_year_id`, `journal_id`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/draft-journal-actions`, `@/lib/journal-posting-actions`, `@/lib/journal-reversal-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_chart_of_accounts`, `acct_divisions`, `acct_financial_years`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Leads

- Route: `/accounting/leads`
- Source: [src/app/(workspace)/accounting/leads/page.tsx](../../src/app/(workspace)/accounting/leads/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: People who asked but have not bought yet
- Static headings: Leads
- Named form controls (including imported UI): `action`, `follow_up_on`, `full_name`, `interest`, `lead_id`, `note`, `phone`, `source`
- Direct guard calls: requireAccess("customers")
- Direct action imports: `@/lib/lead-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_bot_conversations`, `acct_customers`, `acct_leads`, `acct_product_variants`, `acct_sales_headers`, `acct_sales_payments`, `acct_sessions`, `acct_user_access`

## Find by lot

- Route: `/accounting/lots`
- Source: [src/app/(workspace)/accounting/lots/page.tsx](../../src/app/(workspace)/accounting/lots/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, DIVISION_MANAGER
- Purpose: Trace a dye batch to its supplier and customers
- Static headings: Find by lot; Sold from this lot
- Named form controls (including imported UI): `q`
- Direct guard calls: requireAccess("stock")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_sales_headers`, `acct_sales_lines`, `acct_sessions`, `acct_suppliers`, `acct_user_access`

## Running low

- Route: `/accounting/low-stock`
- Source: [src/app/(workspace)/accounting/low-stock/page.tsx](../../src/app/(workspace)/accounting/low-stock/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, DIVISION_MANAGER
- Purpose: Items below the minimum you set, ready to reorder
- Static headings: Running low; Set the minimum for an item
- Named form controls (including imported UI): `back`, `level`, `q`, `variant_id`
- Direct guard calls: requireAccess("stock")
- Direct action imports: `@/lib/stock-count-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_cash_accounts`, `acct_inventory_locations`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_stock_count_lines`, `acct_stock_counts`, `acct_stock_damages`, `acct_stock_finds`, `acct_stock_movements`, `acct_user_access`

## Month close

- Route: `/accounting/month-close`
- Source: [src/app/(workspace)/accounting/month-close/page.tsx](../../src/app/(workspace)/accounting/month-close/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Checklist before closing a month
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_divisions`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_reversals`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_salary_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_counts`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## My investment

- Route: `/accounting/my-investment`
- Source: [src/app/(workspace)/accounting/my-investment/page.tsx](../../src/app/(workspace)/accounting/my-investment/page.tsx)
- Access: INVESTOR
- Purpose: Your money in, paid back, and your profit share
- Static headings: Money in and out; My investment; Payments and receipts; Your agreements; Your profit share
- Named form controls (including imported UI): `from`, `to`
- Direct guard calls: requireAccess("investor_view")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_advance_transactions`, `acct_agreement_versions`, `acct_app_users`, `acct_bank_accounts`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_divisions`, `acct_expense_payments`, `acct_financial_years`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_profit_waterfall_policies`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sessions`, `acct_user_access`

## Coupons

- Route: `/accounting/offers/coupons`
- Source: [src/app/(workspace)/accounting/offers/coupons/page.tsx](../../src/app/(workspace)/accounting/offers/coupons/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Codes that take rupees or a percentage off a whole bill
- Static headings: Coupons; New coupon; Your coupons
- Named form controls (including imported UI): `code`, `coupon_id`, `ends_on`, `kind`, `max_discount`, `min_bill`, `once`, `starts_on`, `status`, `value`, `works_at`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/rewards-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_coupons`, `acct_customers`, `acct_divisions`, `acct_sale_rewards`, `acct_sales_headers`, `acct_sales_returns`, `acct_sessions`, `acct_user_access`

## Offers

- Route: `/accounting/offers`
- Source: [src/app/(workspace)/accounting/offers/page.tsx](../../src/app/(workspace)/accounting/offers/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Discounts for the store, the website, or both
- Static headings: New offer; Offers; Your offers
- Named form controls (including imported UI): `channel`, `ends_on`, `fabric`, `kind`, `name`, `offer_id`, `op`, `product_ids`, `scope`, `starts_on`, `value`, `works_at`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/offer-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_offer_products`, `acct_offers`, `acct_products`, `acct_sessions`, `acct_user_access`

## Online orders

- Route: `/accounting/online-orders`
- Source: [src/app/(workspace)/accounting/online-orders/page.tsx](../../src/app/(workspace)/accounting/online-orders/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER
- Purpose: Orders customers placed on the website
- Static headings: Online orders
- Named form controls (including imported UI): `op`, `order_id`, `shipping`, `staff_note`
- Direct guard calls: requireAccess("online_orders")
- Direct action imports: `@/lib/online-order-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_online_order_lines`, `acct_online_orders`, `acct_sales_headers`, `acct_sessions`, `acct_shop_customers`, `acct_user_access`

## Opening balances

- Route: `/accounting/opening-balances`
- Source: [src/app/(workspace)/accounting/opening-balances/page.tsx](../../src/app/(workspace)/accounting/opening-balances/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: What the business started with
- Static headings: A. Registered Business Bank Accounts; B. Physical Cash Accounts; D. Investor Funding and Other Opening Balances; Investor Bank Activity Opening Positions; Opening Balances; Opening Position
- Named form controls (including imported UI): `description`, `opening_date`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/opening-balance-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_divisions`, `acct_financial_years`, `acct_funding_agreements`, `acct_funding_parties`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_funding_details`, `acct_opening_investor_bank_balances`, `acct_sessions`, `acct_user_access`

## Account-wise Review

- Route: `/accounting/opening-balances/review`
- Source: [src/app/(workspace)/accounting/opening-balances/review/page.tsx](../../src/app/(workspace)/accounting/opening-balances/review/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Account-wise Review; Investor Bank Activity Opening Positions; Items requiring reconciliation; Opening Balance Authorization; Opening Balance Review; Opening Balances: Check, Authorise and Post; Opening Position Summary; Step 3: Post Opening Balances; Validation Results
- Static headings: Account-wise Review; Investor Bank Activity Opening Positions; Items requiring reconciliation; Opening Balance Authorization; Opening Balance Review; Opening Balances: Check, Authorise and Post; Opening Position Summary; Step 3: Post Opening Balances; Validation Results
- Named form controls (including imported UI): `confirm`, `reconciliation_notes`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/opening-balance-posting-actions`, `@/lib/opening-balance-authorization-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_agreement_funding_policies`, `acct_agreement_versions`, `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_divisions`, `acct_financial_years`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_legal_businesses`, `acct_opening_balance_authorizations`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_funding_details`, `acct_opening_investor_bank_balances`, `acct_sessions`, `acct_user_access`

## Owner accounts

- Route: `/accounting/owner-accounts`
- Source: [src/app/(workspace)/accounting/owner-accounts/page.tsx](../../src/app/(workspace)/accounting/owner-accounts/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Business money held in your name, and what was paid from it
- Static headings: Add an owner account; Owner accounts
- Named form controls (including imported UI): `account_name`, `note`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/owner-account-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_cash_accounts`, `acct_cash_closings`, `acct_expense_payments`, `acct_expenses`, `acct_owner_accounts`, `acct_owner_money`, `acct_purchase_payments`, `acct_sessions`, `acct_user_access`

## Owner money in and out

- Route: `/accounting/owner-money`
- Source: [src/app/(workspace)/accounting/owner-money/page.tsx](../../src/app/(workspace)/accounting/owner-money/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Your own money put into, or taken from, the business
- Static headings: History; Owner money in and out; Record money
- Named form controls (including imported UI): `account`, `amount`, `direction`, `entry_date`, `how`, `note`, `owner_account`, `reference`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/owner-money-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_cash_accounts`, `acct_owner_accounts`, `acct_owner_money`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## /accounting/pay-supplier/[batch]

- Route: `/accounting/pay-supplier/[batch]`
- Source: [src/app/(workspace)/accounting/pay-supplier/[batch]/page.tsx](../../src/app/(workspace)/accounting/pay-supplier/[batch]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): `batch_no`, `confirm`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: `@/lib/supplier-pay-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_funding_agreements`, `acct_funding_parties`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_owner_accounts`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Pay a supplier

- Route: `/accounting/pay-supplier`
- Source: [src/app/(workspace)/accounting/pay-supplier/page.tsx](../../src/app/(workspace)/accounting/pay-supplier/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: One payment, spread over their oldest bills
- Static headings: Pay a supplier; Which bills it goes to
- Named form controls (including imported UI): `amount`, `evidence_reference`, `funding_agreement_id`, `funding_party_id`, `owner_account_id`, `payer_name`, `payment_date`, `payment_method`, `payment_reference`, `payment_source`, `remarks`, `source_bank_account_id`, `source_cash_account_id`, `supplier_id`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: `@/lib/supplier-pay-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_funding_agreements`, `acct_funding_parties`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_owner_accounts`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Months and years

- Route: `/accounting/periods`
- Source: [src/app/(workspace)/accounting/periods/page.tsx](../../src/app/(workspace)/accounting/periods/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Open and close accounting months
- Static headings: Accounting Periods; Create Financial Year Periods; Financial Period Register
- Named form controls (including imported UI): `operation`, `period_id`, `reason`, `start_year`, `year`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/accounting-period-actions`, `@/lib/accounting-period-status-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_audit_events`, `acct_financial_years`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Product groups

- Route: `/accounting/product-categories`
- Source: [src/app/(workspace)/accounting/product-categories/page.tsx](../../src/app/(workspace)/accounting/product-categories/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Categories for products
- Static headings: Add Product Category; All Product Categories; Category Hierarchy; Initialize Textile Categories; Product Groups
- Named form controls (including imported UI): `category_name`, `display_order`, `parent_category_id`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/product-category-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_legal_businesses`, `acct_product_categories`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## Product profit

- Route: `/accounting/product-profitability`
- Source: [src/app/(workspace)/accounting/product-profitability/page.tsx](../../src/app/(workspace)/accounting/product-profitability/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Which products earn the most
- Static headings: Product Profitability & Stock Report
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("reports")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_product_variants`, `acct_products`, `acct_sales_headers`, `acct_sales_lines`, `acct_sessions`, `acct_stock_movements`, `acct_user_access`

## Product HSN codes and GST rates

- Route: `/accounting/products/gst`
- Source: [src/app/(workspace)/accounting/products/gst/page.tsx](../../src/app/(workspace)/accounting/products/gst/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Product HSN codes and GST rates
- Static headings: Product HSN codes and GST rates
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/gst-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_business_settings`, `acct_products`, `acct_sessions`, `acct_user_access`

## Products

- Route: `/accounting/products`
- Source: [src/app/(workspace)/accounting/products/page.tsx](../../src/app/(workspace)/accounting/products/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Product list, sizes and colours
- Static headings: 1. Add Product; 2. Add Product Variant / SKU; Products
- Named form controls (including imported UI): `brand_name`, `category_id`, `color_name`, `description`, `design_code`, `design_name`, `fabric`, `product_id`, `product_name`, `size_label`, `unit_of_measure`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/product-master-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_legal_businesses`, `acct_product_categories`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_user_access`

## Quantity prices

- Route: `/accounting/products/quantity-prices`
- Source: [src/app/(workspace)/accounting/products/quantity-prices/page.tsx](../../src/app/(workspace)/accounting/products/quantity-prices/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Lower price per piece when a customer buys 4 or more, or 10 or more
- Static headings: One rule for every product; Own price for a product (optional); Quantity prices
- Named form controls (including imported UI): `off10`, `off4`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/qty-price-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Selling prices

- Route: `/accounting/products/selling-prices`
- Source: [src/app/(workspace)/accounting/products/selling-prices/page.tsx](../../src/app/(workspace)/accounting/products/selling-prices/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Change the minimum, maximum and usual price of a product
- Static headings: Selling prices
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/selling-price-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_sessions`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Supplier bills and payments

- Route: `/accounting/purchase-management`
- Source: [src/app/(workspace)/accounting/purchase-management/page.tsx](../../src/app/(workspace)/accounting/purchase-management/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Receive goods and pay supplier bills
- Static headings: Purchase Register; Record Payment; Supplier Bills and Payments
- Named form controls (including imported UI): `amount`, `confirm`, `evidence_reference`, `funding_agreement_id`, `funding_party_id`, `payer_name`, `payment_date`, `payment_id`, `payment_method`, `payment_reference`, `payment_source`, `purchase_id`, `remarks`, `return_to`, `source_bank_account_id`, `source_cash_account_id`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: `@/lib/purchase-payment-actions`, `@/lib/purchase-payment-verification-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_funding_agreements`, `acct_funding_parties`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_product_variants`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Next step

- Route: `/accounting/purchase-orders/[id]`
- Source: [src/app/(workspace)/accounting/purchase-orders/[id]/page.tsx](../../src/app/(workspace)/accounting/purchase-orders/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Next step
- Static headings: Next step
- Named form controls (including imported UI): `expected_date`, `location_id`, `order_date`, `order_id`, `remarks`, `supplier_id`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: `@/lib/purchase-order-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_inventory_locations`, `acct_legal_businesses`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_order_lines`, `acct_purchase_orders`, `acct_sessions`, `acct_suppliers`, `acct_user_access`

## New purchase order

- Route: `/accounting/purchase-orders/new`
- Source: [src/app/(workspace)/accounting/purchase-orders/new/page.tsx](../../src/app/(workspace)/accounting/purchase-orders/new/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: New purchase order
- Static headings: New purchase order
- Named form controls (including imported UI): `expected_date`, `location_id`, `order_date`, `order_id`, `remarks`, `supplier_id`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_inventory_locations`, `acct_legal_businesses`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_order_lines`, `acct_purchase_orders`, `acct_sessions`, `acct_suppliers`, `acct_user_access`

## Purchase orders

- Route: `/accounting/purchase-orders`
- Source: [src/app/(workspace)/accounting/purchase-orders/page.tsx](../../src/app/(workspace)/accounting/purchase-orders/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Order from a supplier, then turn it into a purchase when goods arrive
- Static headings: Purchase orders
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("purchases")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_divisions`, `acct_purchase_order_lines`, `acct_purchase_orders`, `acct_sessions`, `acct_suppliers`, `acct_user_access`

## Goods Receipt

- Route: `/accounting/purchases/[id]`
- Source: [src/app/(workspace)/accounting/purchases/[id]/page.tsx](../../src/app/(workspace)/accounting/purchases/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Goods Receipt; Purchase Details; Purchase Items; Supplier Payments
- Static headings: Goods Receipt; Purchase Details; Purchase Items; Supplier Payments
- Named form controls (including imported UI): `confirm`, `purchase_id`, `received_date`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: `@/lib/goods-receipt-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_inventory_locations`, `acct_legal_businesses`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_order_lines`, `acct_purchase_orders`, `acct_sessions`, `acct_stock_events`, `acct_stock_movements`, `acct_suppliers`, `acct_user_access`

## Payment History &amp; Verification

- Route: `/accounting/purchases/[id]/payments`
- Source: [src/app/(workspace)/accounting/purchases/[id]/payments/page.tsx](../../src/app/(workspace)/accounting/purchases/[id]/payments/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Payment History &amp; Verification; Payment Summary; Purchase Payments; Record Purchase Payment
- Static headings: Payment History &amp; Verification; Payment Summary; Purchase Payments; Record Purchase Payment
- Named form controls (including imported UI): `amount`, `confirm`, `evidence_reference`, `funding_agreement_id`, `funding_party_id`, `investor_bank_id`, `payer_name`, `payment_date`, `payment_id`, `payment_method`, `payment_reference`, `payment_source`, `purchase_id`, `reason`, `remarks`, `source_bank_account_id`, `source_cash_account_id`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: `@/lib/purchase-payment-split-actions`, `@/lib/purchase-payment-actions`, `@/lib/purchase-payment-verification-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_funding_agreements`, `acct_funding_parties`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Buy stock (purchases)

- Route: `/accounting/purchases`
- Source: [src/app/(workspace)/accounting/purchases/page.tsx](../../src/app/(workspace)/accounting/purchases/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Record stock bought from suppliers
- Static headings: Buy Stock (Purchases); Recent Purchases; Setup Required
- Named form controls (including imported UI): `invoice_date`, `location_id`, `purchase_id`, `remarks`, `report_ids`, `supplier_id`, `supplier_invoice_no`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_financial_years`, `acct_inventory_locations`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sessions`, `acct_stock_drafts`, `acct_stock_movements`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Profit and balance sheet

- Route: `/accounting/reports`
- Source: [src/app/(workspace)/accounting/reports/page.tsx](../../src/app/(workspace)/accounting/reports/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Gross, operating and net profit; what the group owns and owes
- Static headings: Reports
- Named form controls (including imported UI): `from`, `mode`, `to`
- Direct guard calls: requireAccess("reports")
- Direct action imports: `@/lib/ledger-sync-actions`, `@/lib/ledger-sync-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_divisions`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_posting_failures`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Returns and refunds

- Route: `/accounting/returns`
- Source: [src/app/(workspace)/accounting/returns/page.tsx](../../src/app/(workspace)/accounting/returns/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Customer returns, refunds, damaged stock
- Static headings: 1. Customer return; 2. Damaged or lost stock; Refunds paid; Returns and refunds owed; Returns, Refunds and Damaged Stock
- Named form controls (including imported UI): `account`, `amount`, `damage_date`, `damage_id`, `exchange`, `location_id`, `method`, `quantity`, `reason`, `refund_account`, `refund_date`, `refund_delivery`, `refund_id`, `refund_method`, `refund_now`, `remarks`, `return_date`, `return_id`, `sale`, `sale_id`, `variant_id`
- Direct guard calls: requireAccess("returns")
- Direct action imports: `@/lib/returns-actions`, `@/lib/write-off-cancel-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_cash_accounts`, `acct_document_sequences`, `acct_financial_years`, `acct_inventory_locations`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_product_variants`, `acct_products`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_stock_count_lines`, `acct_stock_damages`, `acct_stock_movements`, `acct_user_access`

## /accounting/salaries/[id]/letters

- Route: `/accounting/salaries/[id]/letters`
- Source: [src/app/(workspace)/accounting/salaries/[id]/letters/page.tsx](../../src/app/(workspace)/accounting/salaries/[id]/letters/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): `hours`, `leaves`, `month`, `notice`, `off`, `probation`, `title`, `type`
- Direct guard calls: requireAccess("salary")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_employees`, `acct_salary_payments`, `acct_sessions`, `acct_user_access`

## Change the pay

- Route: `/accounting/salaries/[id]`
- Source: [src/app/(workspace)/accounting/salaries/[id]/page.tsx](../../src/app/(workspace)/accounting/salaries/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Change the pay; Joined, notice and leaving; Pay changes; Salary paid
- Static headings: Change the pay; Joined, notice and leaving; Pay changes; Salary paid
- Named form controls (including imported UI): `effective_from`, `employee_id`, `joined_on`, `left_on`, `monthly_salary`, `note`, `notice_given_on`
- Direct guard calls: requireAccess("salary")
- Direct action imports: `@/lib/staff-record-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_employee_pay_history`, `acct_employees`, `acct_salary_payments`, `acct_sessions`, `acct_user_access`

## Salaries

- Route: `/accounting/salaries`
- Source: [src/app/(workspace)/accounting/salaries/page.tsx](../../src/app/(workspace)/accounting/salaries/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Pay the staff each month and send pay slips
- Static headings: Add a person; Salaries
- Named form controls (including imported UI): `account`, `amount`, `branch_id`, `deduct`, `employee_id`, `full_name`, `how`, `job_title`, `joined_on`, `month`, `monthly_salary`, `note`, `phone`, `what`
- Direct guard calls: requireAccess("salary")
- Direct action imports: `@/lib/salary-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_document_sequences`, `acct_employee_pay_history`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_salary_payments`, `acct_sessions`, `acct_staff_advance_recoveries`, `acct_staff_advances`, `acct_user_access`

## Sales and purchase report

- Route: `/accounting/sales-purchase-report`
- Source: [src/app/(workspace)/accounting/sales-purchase-report/page.tsx](../../src/app/(workspace)/accounting/sales-purchase-report/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, AUDITOR
- Purpose: Day-by-day sales, purchases and profit
- Static headings: Financial years; Sales, Purchase & Daily Profit
- Named form controls (including imported UI): `branch`, `division`, `month`, `type`, `year`
- Direct guard calls: requireAccess("reports")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_divisions`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_posting_failures`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Payment Details

- Route: `/accounting/sales/[id]`
- Source: [src/app/(workspace)/accounting/sales/[id]/page.tsx](../../src/app/(workspace)/accounting/sales/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Payment Details
- Static headings: Payment Details
- Named form controls (including imported UI): `account`, `address`, `amount`, `method`, `payment_date`, `phone`, `reason`, `reference`, `sale_id`
- Direct guard calls: requireAccess("sales")
- Direct action imports: `@/lib/sales-actions`, `@/lib/sale-payment-actions`, `@/lib/customer-merge-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_approval_handouts`, `acct_approval_items`, `acct_audit_events`, `acct_bank_accounts`, `acct_bill_terms`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_note_log`, `acct_coupons`, `acct_customer_messages`, `acct_customers`, `acct_divisions`, `acct_document_copies`, `acct_document_log`, `acct_document_sequences`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_free_stock`, `acct_inventory_locations`, `acct_invoice_shares`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_sale_rewards`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_returns`, `acct_selling_prices`, `acct_serials`, `acct_sessions`, `acct_stock_drafts`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`, `acct_wa_delivery`

## New sale / bill

- Route: `/accounting/sales`
- Source: [src/app/(workspace)/accounting/sales/page.tsx](../../src/app/(workspace)/accounting/sales/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Make a bill and take payment
- Static headings: Recent Sales & Invoices; Recorded Payments; Sales and Billing
- Named form controls (including imported UI): `approval_item_ids`, `branch_id`, `confirm_draft_id`, `coupon_code`, `customer_address`, `customer_name`, `customer_phone`, `customer_type`, `exchange_return_id`, `invoice_date`, `invoice_discount`, `lines_json`, `mode`, `online_order_id`, `payments_json`, `points_used`, `remarks`, `report_id`, `sale_id`, `shipping_charge`, `submit_token`
- Direct guard calls: requireAccess("sales")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_app_users`, `acct_approval_handouts`, `acct_approval_items`, `acct_audit_events`, `acct_bank_accounts`, `acct_bill_terms`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_note_log`, `acct_coupons`, `acct_customers`, `acct_divisions`, `acct_document_sequences`, `acct_financial_years`, `acct_inventory_locations`, `acct_invoice_shares`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_legal_businesses`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_sale_rewards`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_returns`, `acct_selling_prices`, `acct_serials`, `acct_sessions`, `acct_stock_drafts`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Two-step login

- Route: `/accounting/security`
- Source: [src/app/(workspace)/accounting/security/page.tsx](../../src/app/(workspace)/accounting/security/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Authenticator code after your password
- Static headings: Step 1: scan this in your authenticator app; Step 2: type the 6-digit code the app shows; Two-step login; Your backup codes — save them now
- Named form controls (including imported UI): `code`
- Direct guard calls: requireUser()
- Direct action imports: `@/lib/two-step-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_login_challenges`, `acct_sessions`, `acct_user_access`, `acct_user_backup_codes`, `acct_user_totp`

## Piece labels

- Route: `/accounting/serials/labels`
- Source: [src/app/(workspace)/accounting/serials/labels/page.tsx](../../src/app/(workspace)/accounting/serials/labels/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Piece labels
- Static headings: Piece labels
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("products")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_product_variants`, `acct_products`, `acct_serials`, `acct_sessions`, `acct_user_access`

## Piece tracking

- Route: `/accounting/serials`
- Source: [src/app/(workspace)/accounting/serials/page.tsx](../../src/app/(workspace)/accounting/serials/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Give one-of-a-kind pieces their own code
- Static headings: All pieces (latest 400); Items tracked piece by piece; Piece by piece (serial) tracking
- Named form controls (including imported UI): `count`, `on`, `serial_id`, `variant_id`
- Direct guard calls: requireAccess("products")
- Direct action imports: `@/lib/serial-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_product_variants`, `acct_products`, `acct_sales_headers`, `acct_serials`, `acct_sessions`, `acct_user_access`

## Website customers

- Route: `/accounting/shop-customers`
- Source: [src/app/(workspace)/accounting/shop-customers/page.tsx](../../src/app/(workspace)/accounting/shop-customers/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER
- Purpose: People with an account on the website
- Static headings: Website customers
- Named form controls (including imported UI): `customer_id`, `op`, `q`
- Direct guard calls: requireAccess("online_orders")
- Direct action imports: `@/lib/shop-customer-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_sessions`, `acct_shop_customers`, `acct_shop_password_resets`, `acct_shop_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Shop spending

- Route: `/accounting/shop-spending`
- Source: [src/app/(workspace)/accounting/shop-spending/page.tsx](../../src/app/(workspace)/accounting/shop-spending/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Note small cash spending: auto, tea, packing, repairs
- Static headings: Last 7 days; Shop spending
- Named form controls (including imported UI): `amount`, `drawer`, `kind`, `note`, `payee`
- Direct guard calls: requireAccess("shop_spending")
- Direct action imports: `@/lib/shop-spending-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_document_sequences`, `acct_expense_payments`, `acct_expenses`, `acct_inventory_locations`, `acct_sessions`, `acct_user_access`

## Staff advances

- Route: `/accounting/staff-advances`
- Source: [src/app/(workspace)/accounting/staff-advances/page.tsx](../../src/app/(workspace)/accounting/staff-advances/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Money given to staff before payday, taken off their salary
- Static headings: Give an advance; History; Staff advances; Who owes the business
- Named form controls (including imported UI): `account`, `amount`, `employee_id`, `given_on`, `how`, `instalment`, `note`
- Direct guard calls: requireAccess("salary")
- Direct action imports: `@/lib/staff-advance-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_cash_accounts`, `acct_employees`, `acct_product_variants`, `acct_sessions`, `acct_staff_advance_recoveries`, `acct_staff_advances`, `acct_user_access`

## Count stock

- Route: `/accounting/stock-count`
- Source: [src/app/(workspace)/accounting/stock-count/page.tsx](../../src/app/(workspace)/accounting/stock-count/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, CASHIER, DIVISION_MANAGER
- Purpose: Count what is on the shelf and compare with the books
- Static headings: Count stock; Earlier counts; Extra (you counted more than the books say); Short (books say more than you counted)
- Named form controls (including imported UI): `count_id`, `location`, `location_id`, `note`, `q`
- Direct guard calls: requireAccess("stock_count")
- Direct action imports: `@/lib/stock-count-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_cash_accounts`, `acct_inventory_locations`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_stock_count_lines`, `acct_stock_counts`, `acct_stock_damages`, `acct_stock_finds`, `acct_stock_movements`, `acct_user_access`

## Staff stock reports

- Route: `/accounting/stock-reports`
- Source: [src/app/(workspace)/accounting/stock-reports/page.tsx](../../src/app/(workspace)/accounting/stock-reports/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, DIVISION_MANAGER
- Purpose: Approve what staff report on WhatsApp
- Static headings: One-time set-up for automatic WhatsApp; Paste a message; Recently handled; Staff stock reports; Staff who can report
- Named form controls (including imported UI): `full_name`, `id`, `location_id`, `message`, `phone`
- Direct guard calls: requireAccess("stock")
- Direct action imports: `@/lib/stock-report-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_cash_accounts`, `acct_inventory_locations`, `acct_product_variants`, `acct_sessions`, `acct_stock_damages`, `acct_stock_drafts`, `acct_stock_movements`, `acct_stock_reporters`, `acct_user_access`

## Move stock

- Route: `/accounting/stock-transfers`
- Source: [src/app/(workspace)/accounting/stock-transfers/page.tsx](../../src/app/(workspace)/accounting/stock-transfers/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Send stock between warehouse and shops
- Static headings: Stock Transfer History; Stock Transfers
- Named form controls (including imported UI): `from_location_id`, `received_date`, `remarks`, `to_location_id`, `transfer_date`, `transfer_id`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_divisions`, `acct_document_sequences`, `acct_inventory_locations`, `acct_legal_businesses`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Stock on hand

- Route: `/accounting/stock`
- Source: [src/app/(workspace)/accounting/stock/page.tsx](../../src/app/(workspace)/accounting/stock/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, DIVISION_MANAGER
- Purpose: What is in every warehouse and shop right now
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_branches`, `acct_inventory_locations`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`, `acct_user_access`

## Credit on my account

- Route: `/accounting/supplier-returns/[id]`
- Source: [src/app/(workspace)/accounting/supplier-returns/[id]/page.tsx](../../src/app/(workspace)/accounting/supplier-returns/[id]/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Credit on my account; Is the credit wrong?; Refund (supplier paid money back); Replacement items; What did the supplier do?
- Static headings: Credit on my account; Is the credit wrong?; Refund (supplier paid money back); Replacement items; What did the supplier do?
- Named form controls (including imported UI): `account`, `agreed_value`, `amount`, `method`, `refund_date`, `replacement_purchase_id`, `return_id`
- Direct guard calls: requireAccess("supplier_returns")
- Direct action imports: `@/lib/supplier-return-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_cash_accounts`, `acct_inventory_locations`, `acct_journal_entries`, `acct_journal_reversals`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sessions`, `acct_stock_damages`, `acct_stock_movements`, `acct_supplier_refunds`, `acct_supplier_return_lines`, `acct_supplier_return_replacements`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Return goods to supplier

- Route: `/accounting/supplier-returns`
- Source: [src/app/(workspace)/accounting/supplier-returns/page.tsx](../../src/app/(workspace)/accounting/supplier-returns/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Send items back and get credit, refund or replacement
- Static headings: 1. Pick the purchase the goods came from; Earlier returns; Return goods to a supplier
- Named form controls (including imported UI): `accept_loss`, `agreed_value`, `location`, `location_id`, `purchase`, `purchase_id`, `reason`, `remarks`, `return_date`, `supplier_note_no`
- Direct guard calls: requireAccess("supplier_returns")
- Direct action imports: `@/lib/supplier-return-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_cash_accounts`, `acct_inventory_locations`, `acct_journal_entries`, `acct_journal_reversals`, `acct_product_variants`, `acct_products`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sessions`, `acct_stock_damages`, `acct_stock_movements`, `acct_supplier_refunds`, `acct_supplier_return_lines`, `acct_supplier_return_replacements`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Supplier statement

- Route: `/accounting/supplier-statement`
- Source: [src/app/(workspace)/accounting/supplier-statement/page.tsx](../../src/app/(workspace)/accounting/supplier-statement/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: What you owe each supplier, and how old it is
- Static headings: How old is what you owe?; Supplier statement
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("supplier_returns")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_customers`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sessions`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Suppliers

- Route: `/accounting/suppliers`
- Source: [src/app/(workspace)/accounting/suppliers/page.tsx](../../src/app/(workspace)/accounting/suppliers/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: People you buy from
- Static headings: Add Supplier; Suppliers
- Named form controls (including imported UI): `address`, `city`, `contact_person`, `credit_days`, `email`, `gstin`, `mobile`, `notes`, `payment_terms`, `postal_code`, `state_name`, `supplier_name`, `supplier_type`, `whatsapp_number`
- Direct guard calls: requireAccess("purchases")
- Direct action imports: `@/lib/supplier-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_legal_businesses`, `acct_product_variants`, `acct_sessions`, `acct_suppliers`, `acct_user_access`

## /accounting/warehouse-inventory

- Route: `/accounting/warehouse-inventory`
- Source: [src/app/(workspace)/accounting/warehouse-inventory/page.tsx](../../src/app/(workspace)/accounting/warehouse-inventory/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT, DIVISION_MANAGER
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): None detected

## Send reports on WhatsApp

- Route: `/accounting/whatsapp`
- Source: [src/app/(workspace)/accounting/whatsapp/page.tsx](../../src/app/(workspace)/accounting/whatsapp/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Daily and monthly reports to your team
- Static headings: Add a person; Message log; People and their reports; Send today&apos;s reports; WhatsApp Reports
- Named form controls (including imported UI): `full_name`, `investor_party_id`, `phone`, `recipient_id`, `report_type`, `scope`, `status`, `subscription_id`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/whatsapp-actions`
- Referenced tables (dependency closure): `acct_advance_transactions`, `acct_advances`, `acct_agreement_versions`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_bank_accounts`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_divisions`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_inventory_locations`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_reversals`, `acct_online_orders`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_product_variants`, `acct_products`, `acct_profit_waterfall_policies`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_stock_movements`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`, `acct_whatsapp_outbox`, `acct_whatsapp_recipients`, `acct_whatsapp_subscriptions`

## Year end

- Route: `/accounting/year-end`
- Source: [src/app/(workspace)/accounting/year-end/page.tsx](../../src/app/(workspace)/accounting/year-end/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Start the new year and close the old one
- Static headings: Step 2: close the old year (after it has ended); Year end; Years
- Named form controls (including imported UI): `confirm`, `year_id`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/year-end-actions`
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_bank_accounts`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_reversals`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Branches

- Route: `/branches`
- Source: [src/app/(workspace)/branches/page.tsx](../../src/app/(workspace)/branches/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Branch Management; Branch Register; Create Branch
- Static headings: Branch Management; Branch Register; Create Branch
- Named form controls (including imported UI): `address_line1`, `address_line2`, `branch_id`, `branch_name`, `city`, `division_id`, `opened_on`, `postal_code`, `state`, `status`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/branch-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_financial_years`, `acct_funding_agreements`, `acct_legal_businesses`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## Dashboard

- Route: `/dashboard`
- Source: [src/app/(workspace)/dashboard/page.tsx](../../src/app/(workspace)/dashboard/page.tsx)
- Access: GROUP_OWNER, ACCOUNTANT
- Purpose: Today's sales, profit and money at a glance
- Static headings: Dashboard; How net profit is worked out; Last 30 days; Money you hold now; Stock, suppliers and investors; This month so far; Today
- Named form controls (including imported UI): None detected statically
- Direct guard calls: requireAccess("dashboard")
- Direct action imports: None
- Referenced tables (dependency closure): `acct_accounting_periods`, `acct_advance_transactions`, `acct_advances`, `acct_app_users`, `acct_asset_dep_runs`, `acct_asset_depreciation`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_business_settings`, `acct_cash_accounts`, `acct_cash_closings`, `acct_chart_of_accounts`, `acct_customers`, `acct_divisions`, `acct_employees`, `acct_expense_payments`, `acct_expenses`, `acct_financial_years`, `acct_fixed_assets`, `acct_free_stock`, `acct_funding_agreements`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_journal_post_sequences`, `acct_journal_reversals`, `acct_online_orders`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_owner_money`, `acct_party_setoff_lines`, `acct_party_setoffs`, `acct_posting_failures`, `acct_purchase_headers`, `acct_purchase_lines`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sales_return_lines`, `acct_sales_returns`, `acct_sessions`, `acct_staff_advances`, `acct_stock_damages`, `acct_stock_finds`, `acct_supplier_refunds`, `acct_supplier_returns`, `acct_suppliers`, `acct_user_access`

## Divisions

- Route: `/divisions`
- Source: [src/app/(workspace)/divisions/page.tsx](../../src/app/(workspace)/divisions/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Add New Division; Business Divisions; Division Register
- Static headings: Add New Division; Business Divisions; Division Register
- Named form controls (including imported UI): `divisionId`, `name`, `status`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/division-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_financial_years`, `acct_inventory_locations`, `acct_legal_businesses`, `acct_product_categories`, `acct_product_variants`, `acct_products`, `acct_sessions`, `acct_user_access`

## Agreement Documents

- Route: `/funding/agreements/[id]`
- Source: [src/app/(workspace)/funding/agreements/[id]/page.tsx](../../src/app/(workspace)/funding/agreements/[id]/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Agreement Documents; Amendment Decision; Funding &amp; Profit/Loss Policy; Generate Agreement Document; Propose Agreement Amendment; Registered Documents; Review &amp; Activate Original Agreement; Revise Investor Profit Share; Signed Amendment Review; Signed Document; Upload Agreement Document; Version History
- Static headings: Agreement Documents; Amendment Decision; Funding &amp; Profit/Loss Policy; Generate Agreement Document; Propose Agreement Amendment; Registered Documents; Review &amp; Activate Original Agreement; Revise Investor Profit Share; Signed Amendment Review; Signed Document; Upload Agreement Document; Version History
- Named form controls (including imported UI): `additional_funding_allowed`, `agreement_document_role`, `agreement_id`, `agreement_notes`, `agreement_version_id`, `amendment_id`, `amendment_reason`, `bank_account_id`, `change_reason`, `committed_amount`, `confirmed`, `decision`, `document`, `document_verified`, `effective_from`, `effective_to`, `entitlement_on_zero_balance`, `evidence_id`, `evidence_reference`, `file`, `flexible_repayment_allowed`, `funding_model`, `gl_account_id`, `interest_method`, `investor_consent_verified`, `loss_settlement_method`, `loss_share_percentage`, `loss_sharing_model`, `loss_sharing_terms`, `maximum_loss_exposure`, `maximum_outstanding`, `minimum_funding`, `payout_frequency`, `policy_notes`, `principal_repayment_terms`, `profit_basis`, `profit_calculation_order`, `profit_entitlement_model`, `profit_share_percentage`, `return_percentage`, `return_to`, `review_notes`, `signed_document_id`, `verification_notes`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/agreement-amendment-actions`, `@/lib/agreement-activation-actions`, `@/lib/amendment-approval-actions`, `@/lib/agreement-document-actions`, `@/lib/generate-agreement-actions`, `@/lib/profit-share-amendment-actions`, `@/lib/amendment-review-actions`
- Referenced tables (dependency closure): `acct_advance_transactions`, `acct_agreement_amendments`, `acct_agreement_funding_policies`, `acct_agreement_versions`, `acct_amendment_evidence_reviews`, `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_bank_evidence`, `acct_bank_verifications`, `acct_branches`, `acct_business_documents`, `acct_business_settings`, `acct_cash_accounts`, `acct_chart_of_accounts`, `acct_divisions`, `acct_expense_payments`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_journal_entries`, `acct_journal_lines`, `acct_legal_businesses`, `acct_opening_balance_batches`, `acct_opening_balance_lines`, `acct_opening_investor_bank_balances`, `acct_profit_waterfall_policies`, `acct_purchase_payments`, `acct_sales_headers`, `acct_sales_payments`, `acct_sales_refunds`, `acct_sessions`, `acct_user_access`

## Agreements

- Route: `/funding/agreements`
- Source: [src/app/(workspace)/funding/agreements/page.tsx](../../src/app/(workspace)/funding/agreements/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Profit-sharing and loan agreements
- Static headings: Agreement Register; Create Funding Agreement; Funding Agreements
- Named form controls (including imported UI): `agreement_notes`, `branch_id`, `committed_amount`, `division_id`, `effective_from`, `effective_to`, `funding_scope`, `funding_type`, `interest_method`, `interest_rate_percentage`, `loss_sharing_terms`, `party_id`, `payout_frequency`, `principal_repayment_terms`, `profit_basis`, `profit_share_percentage`
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_agreement_versions`, `acct_app_users`, `acct_audit_events`, `acct_branches`, `acct_divisions`, `acct_financial_years`, `acct_funding_agreements`, `acct_funding_parties`, `acct_legal_businesses`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## Investors and lenders

- Route: `/funding`
- Source: [src/app/(workspace)/funding/page.tsx](../../src/app/(workspace)/funding/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: People who put money into the business
- Static headings: Add Funding Party; Funding Party Register; Investors & Lenders
- Named form controls (including imported UI): `email`, `full_name`, `notes`, `pan_last4`, `party_code`, `party_id`, `party_type`, `phone`, `status`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/funding-party-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_funding_agreements`, `acct_funding_parties`, `acct_legal_businesses`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## Share register

- Route: `/funding/participation`
- Source: [src/app/(workspace)/funding/participation/page.tsx](../../src/app/(workspace)/funding/participation/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Who holds what share, by division and branch
- Static headings: Agreement Version History; Illustrative Effective Profit Participation; Investor & Profit Participation Register; Participation Date
- Named form controls (including imported UI): `asOf`
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_agreement_amendments`, `acct_agreement_funding_policies`, `acct_agreement_versions`, `acct_app_users`, `acct_branches`, `acct_divisions`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_sessions`, `acct_user_access`

## Share check

- Route: `/funding/reconciliation`
- Source: [src/app/(workspace)/funding/reconciliation/page.tsx](../../src/app/(workspace)/funding/reconciliation/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Check that shares add up correctly
- Static headings: Direct Profit Pool Reconciliation; Interpretation; Profit Participation Reconciliation; Reconciliation Findings; Reconciliation Summary
- Named form controls (including imported UI): `date`
- Direct guard calls: requireGroupOwner()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_agreement_amendments`, `acct_agreement_funding_policies`, `acct_agreement_versions`, `acct_amendment_evidence_reviews`, `acct_app_users`, `acct_branches`, `acct_divisions`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_sessions`, `acct_user_access`

## Money received and returned

- Route: `/funding/transactions`
- Source: [src/app/(workspace)/funding/transactions/page.tsx](../../src/app/(workspace)/funding/transactions/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Deposits, repayments and profit paid out
- Static headings: Eligible Agreement Balances; Funding Transaction Register; Funding Transactions; Pay an investor; Record Funding Received
- Named form controls (including imported UI): `account`, `agreement_id`, `amount`, `kind`, `payment_method`, `payment_reference`, `remarks`, `transaction_date`, `transaction_id`, `treatment`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/funding-transactions`, `@/lib/investor-payment-actions`, `@/lib/funding-receipt-actions`
- Referenced tables (dependency closure): `acct_agreement_amendments`, `acct_agreement_funding_policies`, `acct_agreement_versions`, `acct_app_users`, `acct_audit_events`, `acct_bank_accounts`, `acct_branches`, `acct_cash_accounts`, `acct_divisions`, `acct_funding_agreements`, `acct_funding_parties`, `acct_funding_transactions`, `acct_product_variants`, `acct_sessions`, `acct_user_access`

## Group details

- Route: `/group`
- Source: [src/app/(workspace)/group/page.tsx](../../src/app/(workspace)/group/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Archived Documents; Business Documents; Business Information; Financial Years; Group Master; Owners &amp; Authorized Persons; Update Business Registration
- Static headings: Archived Documents; Business Documents; Business Information; Financial Years; Group Master; Owners &amp; Authorized Persons; Update Business Registration
- Named form controls (including imported UI): `archive_reason`, `division_id`, `document`, `document_id`, `document_type`, `email`, `full_name`, `gstin`, `legal_name`, `pan_last4`, `person_id`, `phone`, `registration_year`, `role`, `status`, `trading_name`, `udyam_registration_no`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/group-actions`, `@/lib/person-update-actions`, `@/lib/document-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_business_documents`, `acct_business_people`, `acct_divisions`, `acct_financial_years`, `acct_legal_businesses`, `acct_sessions`, `acct_user_access`

## Users and access

- Route: `/users`
- Source: [src/app/(workspace)/users/page.tsx](../../src/app/(workspace)/users/page.tsx)
- Access: GROUP_OWNER (navigation default)
- Purpose: Who can sign in and what they can open
- Static headings: Add a person; People; Users &amp; Access; What each access level can open
- Named form controls (including imported UI): `email`, `full_name`, `party_id`, `password`, `role`, `scope_division_id`, `status`, `user_id`
- Direct guard calls: requireGroupOwner()
- Direct action imports: `@/lib/user-actions`
- Referenced tables (dependency closure): `acct_app_users`, `acct_audit_events`, `acct_divisions`, `acct_funding_parties`, `acct_login_challenges`, `acct_sessions`, `acct_user_access`, `acct_user_backup_codes`, `acct_user_totp`

## Enter your code

- Route: `/login/code`
- Source: [src/app/login/code/page.tsx](../../src/app/login/code/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: Enter your code
- Static headings: Enter your code
- Named form controls (including imported UI): `code`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_login_challenges`, `acct_user_backup_codes`, `acct_user_totp`

## Accounting Portal

- Route: `/login`
- Source: [src/app/login/page.tsx](../../src/app/login/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: Accounting Portal
- Static headings: Accounting Portal
- Named form controls (including imported UI): `email`, `password`
- Direct guard calls: getSessionUser()
- Direct action imports: None
- Referenced tables (dependency closure): `acct_app_users`, `acct_sessions`, `acct_user_access`

## /

- Route: `/`
- Source: [src/app/page.tsx](../../src/app/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): None detected

## /shop/[id]

- Route: `/shop/[id]`
- Source: [src/app/shop/[id]/page.tsx](../../src/app/shop/[id]/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## /shop/account/forgot

- Route: `/shop/account/forgot`
- Source: [src/app/shop/account/forgot/page.tsx](../../src/app/shop/account/forgot/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): `email`, `password`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): None detected

## /shop/account/login

- Route: `/shop/account/login`
- Source: [src/app/shop/account/login/page.tsx](../../src/app/shop/account/login/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): `email`, `name`, `password`, `phone`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_shop_customers`, `acct_shop_email_verifications`, `acct_shop_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## Your orders

- Route: `/shop/account`
- Source: [src/app/shop/account/page.tsx](../../src/app/shop/account/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: Your orders
- Static headings: Your orders
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_shop_customers`, `acct_shop_email_verifications`, `acct_shop_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## /shop/account/register

- Route: `/shop/account/register`
- Source: [src/app/shop/account/register/page.tsx](../../src/app/shop/account/register/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): `email`, `name`, `password`, `phone`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_shop_customers`, `acct_shop_email_verifications`, `acct_shop_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## /shop/account/reset

- Route: `/shop/account/reset`
- Source: [src/app/shop/account/reset/page.tsx](../../src/app/shop/account/reset/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): `email`, `password`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): None detected

## Confirm your email

- Route: `/shop/account/verify`
- Source: [src/app/shop/account/verify/page.tsx](../../src/app/shop/account/verify/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: Confirm your email
- Static headings: Confirm your email
- Named form controls (including imported UI): `token`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: `@/lib/shop-verify-actions`
- Referenced tables (dependency closure): `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_shop_customers`, `acct_shop_email_verifications`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## Abhiram Textiles

- Route: `/shop/bill/[token]`
- Source: [src/app/shop/bill/[token]/page.tsx](../../src/app/shop/bill/[token]/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: Abhiram Textiles
- Static headings: Abhiram Textiles
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_bill_terms`, `acct_branches`, `acct_business_settings`, `acct_invoice_shares`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_sales_headers`, `acct_sales_lines`, `acct_sales_payments`, `acct_selling_prices`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## /shop/cart

- Route: `/shop/cart`
- Source: [src/app/shop/cart/page.tsx](../../src/app/shop/cart/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): None detected

## /shop/checkout

- Route: `/shop/checkout`
- Source: [src/app/shop/checkout/page.tsx](../../src/app/shop/checkout/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: See page source and linked modules for redirect or dynamic content.
- Static headings: Dynamic or delegated
- Named form controls (including imported UI): `address`, `city`, `country`, `country_other`, `email`, `name`, `note`, `phone`, `postal`, `state`, `website`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_shop_customers`, `acct_shop_email_verifications`, `acct_shop_sessions`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## Cotton sets

- Route: `/shop`
- Source: [src/app/shop/page.tsx](../../src/app/shop/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: Cotton sets; Fresh on the shelf; Kalamkari; Not sure about size or colour?; Sarees; Shop
- Static headings: Cotton sets; Fresh on the shelf; Kalamkari; Not sure about size or colour?; Sarees; Shop
- Named form controls (including imported UI): `fabric`, `q`
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): `acct_business_settings`, `acct_offer_products`, `acct_offers`, `acct_online_order_lines`, `acct_online_orders`, `acct_product_media`, `acct_product_variants`, `acct_products`, `acct_selling_prices`, `acct_stock_movements`, `acct_stock_transfer_lines`, `acct_stock_transfers`

## Thank you!

- Route: `/shop/thanks`
- Source: [src/app/shop/thanks/page.tsx](../../src/app/shop/thanks/page.tsx)
- Access: Outside workspace; public or shop-account-specific checks apply
- Purpose: Thank you!
- Static headings: Thank you!
- Named form controls (including imported UI): None detected statically
- Direct guard calls: Inspect page dependencies / layout
- Direct action imports: None
- Referenced tables (dependency closure): None detected


