# Migration register

For a new empty database, the documented baseline is the base dump through 040, then 041–078 in numeric order. For an existing database, inspect actual schema and migration history before choosing files. This register is not evidence of production application or safe replay.

| Migration | Purpose from filename | Referenced tables |
| --- | --- | --- |
| [migrations/001_investor_capital_account.sql](../../migrations/001_investor_capital_account.sql) | investor capital account | acct_chart_of_accounts, acct_legal_businesses |
| [migrations/002_missing_schema_and_accounts.sql](../../migrations/002_missing_schema_and_accounts.sql) | missing schema and accounts | acct_chart_of_accounts, acct_funding_transactions, acct_legal_businesses, acct_opening_investor_bank_balances |
| [migrations/003_setup_costs.sql](../../migrations/003_setup_costs.sql) | setup costs | acct_chart_of_accounts, acct_expenses, acct_journal_entries, acct_legal_businesses |
| [migrations/004_opening_date_12_oct.sql](../../migrations/004_opening_date_12_oct.sql) | opening date 12 oct | acct_opening_balance_batches |
| [migrations/005_returns_refunds_damages.sql](../../migrations/005_returns_refunds_damages.sql) | returns refunds damages | acct_chart_of_accounts, acct_legal_businesses, acct_sales_refunds, acct_sales_return_lines, acct_sales_returns, acct_stock_damages |
| [migrations/006_setup_costs_as_asset.sql](../../migrations/006_setup_costs_as_asset.sql) | setup costs as asset | acct_chart_of_accounts, acct_legal_businesses |
| [migrations/007_business_settings.sql](../../migrations/007_business_settings.sql) | business settings | acct_business_settings, acct_legal_businesses |
| [migrations/008_whatsapp_reports.sql](../../migrations/008_whatsapp_reports.sql) | whatsapp reports | acct_app_users, acct_business_settings, acct_legal_businesses, acct_whatsapp_outbox, acct_whatsapp_recipients, acct_whatsapp_subscriptions |
| [migrations/009_backfill_barcodes.sql](../../migrations/009_backfill_barcodes.sql) | backfill barcodes | acct_product_variants |
| [migrations/010_customers.sql](../../migrations/010_customers.sql) | customers | acct_customers, acct_legal_businesses, acct_sales_headers |
| [migrations/011_catalogue_media.sql](../../migrations/011_catalogue_media.sql) | catalogue media | acct_product_media, acct_stock_events |
| [migrations/012_customer_messages.sql](../../migrations/012_customer_messages.sql) | customer messages | acct_customer_messages |
| [migrations/013_stock_reports.sql](../../migrations/013_stock_reports.sql) | stock reports | acct_stock_drafts, acct_stock_reporters |
| [migrations/014_online_shop.sql](../../migrations/014_online_shop.sql) | online shop | acct_products |
| [migrations/015_instagram_posts.sql](../../migrations/015_instagram_posts.sql) | instagram posts | acct_instagram_posts |
| [migrations/016_shop_prices.sql](../../migrations/016_shop_prices.sql) | shop prices | acct_product_variants |
| [migrations/017_gst_ready.sql](../../migrations/017_gst_ready.sql) | gst ready | acct_business_settings, acct_legal_businesses, acct_products, acct_purchase_lines, acct_sales_headers, acct_sales_lines |
| [migrations/018_supplier_returns_free_stock.sql](../../migrations/018_supplier_returns_free_stock.sql) | supplier returns free stock | acct_chart_of_accounts, acct_free_stock, acct_free_stock_lines, acct_legal_businesses, acct_supplier_refunds, acct_supplier_return_lines, acct_supplier_return_replacements, acct_supplier_returns |
| [migrations/019_items_on_approval.sql](../../migrations/019_items_on_approval.sql) | items on approval | acct_approval_handouts, acct_approval_items |
| [migrations/020_cash_closing.sql](../../migrations/020_cash_closing.sql) | cash closing | acct_cash_closings |
| [migrations/021_settlement_discount.sql](../../migrations/021_settlement_discount.sql) | settlement discount | acct_sales_payments |
| [migrations/022_sale_submit_token.sql](../../migrations/022_sale_submit_token.sql) | sale submit token | acct_sales_headers |
| [migrations/023_stock_count_low_stock.sql](../../migrations/023_stock_count_low_stock.sql) | stock count low stock | acct_product_variants, acct_stock_count_lines, acct_stock_counts |
| [migrations/024_auditor_role.sql](../../migrations/024_auditor_role.sql) | auditor role | acct_user_access |
| [migrations/025_auditor_adjustments.sql](../../migrations/025_auditor_adjustments.sql) | auditor adjustments | acct_auditor_adjustments |
| [migrations/026_salaries_and_spending.sql](../../migrations/026_salaries_and_spending.sql) | salaries and spending | acct_employees, acct_expenses, acct_salary_payments |
| [migrations/027_party_link_setoff.sql](../../migrations/027_party_link_setoff.sql) | party link setoff | acct_customers, acct_party_setoff_lines, acct_party_setoffs, acct_purchase_payments, acct_sales_payments, acct_suppliers |
| [migrations/028_purchase_orders.sql](../../migrations/028_purchase_orders.sql) | purchase orders | acct_purchase_order_lines, acct_purchase_orders |
| [migrations/029_manager_investor_logins.sql](../../migrations/029_manager_investor_logins.sql) | manager investor logins | acct_user_access |
| [migrations/030_fixed_assets.sql](../../migrations/030_fixed_assets.sql) | fixed assets | acct_asset_dep_runs, acct_asset_depreciation, acct_chart_of_accounts, acct_fixed_assets, acct_legal_businesses |
| [migrations/031_staff_advances.sql](../../migrations/031_staff_advances.sql) | staff advances | acct_chart_of_accounts, acct_expense_payments, acct_legal_businesses, acct_salary_payments, acct_staff_advance_recoveries, acct_staff_advances |
| [migrations/032_cash_denominations.sql](../../migrations/032_cash_denominations.sql) | cash denominations | acct_cash_closings |
| [migrations/033_online_orders.sql](../../migrations/033_online_orders.sql) | online orders | acct_online_order_lines, acct_online_orders |
| [migrations/034_online_details_offers.sql](../../migrations/034_online_details_offers.sql) | online details offers | acct_offer_products, acct_offers, acct_online_order_lines, acct_product_variants, acct_products |
| [migrations/035_shop_customers.sql](../../migrations/035_shop_customers.sql) | shop customers | acct_online_orders, acct_shop_customers, acct_shop_sessions |
| [migrations/036_shop_password_resets.sql](../../migrations/036_shop_password_resets.sql) | shop password resets | acct_shop_customers, acct_shop_password_resets |
| [migrations/037_owner_money.sql](../../migrations/037_owner_money.sql) | owner money | acct_owner_money |
| [migrations/038_invoice_shares.sql](../../migrations/038_invoice_shares.sql) | invoice shares | acct_invoice_shares |
| [migrations/039_cash_taken_destination.sql](../../migrations/039_cash_taken_destination.sql) | cash taken destination | acct_cash_closings |
| [migrations/040_funding_confirmation.sql](../../migrations/040_funding_confirmation.sql) | funding confirmation | acct_funding_transactions |
| [migrations/041_shop_email_verification.sql](../../migrations/041_shop_email_verification.sql) | shop email verification | acct_shop_customers, acct_shop_email_verifications |
| [migrations/042_sale_delivery_charge.sql](../../migrations/042_sale_delivery_charge.sql) | sale delivery charge | acct_chart_of_accounts, acct_legal_businesses, acct_sales_headers |
| [migrations/043_stock_finds.sql](../../migrations/043_stock_finds.sql) | stock finds | acct_stock_count_lines, acct_stock_finds |
| [migrations/044_exchange.sql](../../migrations/044_exchange.sql) | exchange | acct_sales_payments |
| [migrations/045_morning_digest.sql](../../migrations/045_morning_digest.sql) | morning digest | acct_whatsapp_subscriptions |
| [migrations/046_chatbot.sql](../../migrations/046_chatbot.sql) | chatbot | acct_bot_answers, acct_bot_conversations, acct_bot_messages |
| [migrations/047_investor_returns.sql](../../migrations/047_investor_returns.sql) | investor returns | acct_chart_of_accounts, acct_funding_transactions, acct_legal_businesses |
| [migrations/048_estimates_address.sql](../../migrations/048_estimates_address.sql) | estimates address | acct_sales_headers |
| [migrations/049_social_posts.sql](../../migrations/049_social_posts.sql) | social posts | acct_instagram_posts |
| [migrations/050_exchange_index.sql](../../migrations/050_exchange_index.sql) | exchange index | acct_sales_payments |
| [migrations/051_posting_failures.sql](../../migrations/051_posting_failures.sql) | posting failures | acct_posting_failures |
| [migrations/052_stock_movement_key.sql](../../migrations/052_stock_movement_key.sql) | stock movement key | acct_stock_movements |
| [migrations/053_return_delivery_refund.sql](../../migrations/053_return_delivery_refund.sql) | return delivery refund | acct_sales_returns |
| [migrations/054_login_attempts.sql](../../migrations/054_login_attempts.sql) | login attempts | acct_login_attempts |
| [migrations/055_loans_payable_account.sql](../../migrations/055_loans_payable_account.sql) | loans payable account | acct_chart_of_accounts, acct_legal_businesses |
| [migrations/056_vouchers.sql](../../migrations/056_vouchers.sql) | vouchers | acct_vouchers |
| [migrations/057_expense_payee.sql](../../migrations/057_expense_payee.sql) | expense payee | acct_expenses |
| [migrations/058_document_register.sql](../../migrations/058_document_register.sql) | document register | acct_document_copies, acct_document_log |
| [migrations/059_quantity_prices.sql](../../migrations/059_quantity_prices.sql) | quantity prices | acct_product_variants |
| [migrations/060_selling_prices.sql](../../migrations/060_selling_prices.sql) | selling prices | acct_selling_prices |
| [migrations/061_bank_statements.sql](../../migrations/061_bank_statements.sql) | bank statements | acct_bank_statement_lines |
| [migrations/062_staff_record.sql](../../migrations/062_staff_record.sql) | staff record | acct_employee_pay_history, acct_employees |
| [migrations/063_rewards.sql](../../migrations/063_rewards.sql) | rewards | acct_coupons, acct_sale_rewards |
| [migrations/064_offer_branches.sql](../../migrations/064_offer_branches.sql) | offer branches | acct_coupons, acct_offers |
| [migrations/065_two_step_login.sql](../../migrations/065_two_step_login.sql) | two step login | acct_login_challenges, acct_user_backup_codes, acct_user_totp |
| [migrations/066_bill_terms.sql](../../migrations/066_bill_terms.sql) | bill terms | acct_bill_terms, acct_sales_headers |
| [migrations/067_customer_notes.sql](../../migrations/067_customer_notes.sql) | customer notes | acct_customer_notes |
| [migrations/068_leads.sql](../../migrations/068_leads.sql) | leads | acct_leads |
| [migrations/069_deals.sql](../../migrations/069_deals.sql) | deals | acct_deals |
| [migrations/070_lots.sql](../../migrations/070_lots.sql) | lots | acct_purchase_lines, acct_sales_lines |
| [migrations/071_serials.sql](../../migrations/071_serials.sql) | serials | acct_product_variants, acct_serials |
| [migrations/072_cash_note_log.sql](../../migrations/072_cash_note_log.sql) | cash note log | acct_cash_note_log |
| [migrations/073_reel_tracks.sql](../../migrations/073_reel_tracks.sql) | reel tracks | acct_reel_tracks |
| [migrations/074_wa_broadcasts.sql](../../migrations/074_wa_broadcasts.sql) | wa broadcasts | acct_customers, acct_wa_broadcast_recipients, acct_wa_broadcasts, acct_wa_delivery |
| [migrations/075_supplier_payment_batches.sql](../../migrations/075_supplier_payment_batches.sql) | supplier payment batches | acct_purchase_payments |
| [migrations/076_owner_accounts_cash_destinations.sql](../../migrations/076_owner_accounts_cash_destinations.sql) | owner accounts cash destinations | acct_cash_closings, acct_expense_payments, acct_owner_accounts, acct_owner_money, acct_purchase_payments |
| [migrations/077_wa_status_log.sql](../../migrations/077_wa_status_log.sql) | wa status log | acct_wa_status_log |
| [migrations/078_follow_ups.sql](../../migrations/078_follow_ups.sql) | follow ups | acct_customer_notes |

