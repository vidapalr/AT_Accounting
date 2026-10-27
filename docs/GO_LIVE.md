# Go-live checklist (branch feat/ledger-dry-run -> main)

Do the steps in this order. Hosting rebuilds automatically after `git push origin main`.

## 1. Database (phpMyAdmin, on the LIVE database)
Paste each file in the SQL tab, in this order. All are safe to run again if unsure.
001 to 006 should already be applied. Pending list:
007_business_settings, 008_whatsapp_reports, 009_backfill_barcodes, 010_customers,
011_catalogue_media, 012_customer_messages, 013_stock_reports, 014_online_shop,
015_instagram_posts, 016_shop_prices, 017_gst_ready, 018_supplier_returns_free_stock, 019_items_on_approval, 020_cash_closing, 021_settlement_discount, 022_sale_submit_token, 023_stock_count_low_stock, 024_auditor_role, 025_auditor_adjustments, 026_salaries_and_spending, 027_party_link_setoff, 028_purchase_orders, 029_manager_investor_logins, 030_fixed_assets, 031_staff_advances, 032_cash_denominations, 033_online_orders, 034_online_details_offers.
(Re-run on the test database: all nine ran again without errors.)

## 2. Server settings on Hostinger (Node.js app, environment variables)
Required:
- MEDIA_DIR = a folder OUTSIDE the app folder (photos and videos are saved here; the app folder is replaced on every deploy)
- SHOP_PUBLIC_URL = https://accounting.abhiraminc.com
Optional, add when ready:
- WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET (staff stock messages by WhatsApp)
- INSTAGRAM_USER_ID = 1429287470264568, INSTAGRAM_ACCESS_TOKEN (automatic Instagram posting)

## 3. Merge (PowerShell)
cd E:\Projects\abhiram-accounting
git checkout feat/ledger-dry-run
git pull
git checkout main
git pull
git merge feat/ledger-dry-run
git push origin main
git checkout feat/ledger-dry-run

## 4. Check on the live site
Dashboard, Reports, one invoice, /shop opens (even in a private window), a product's Post to Instagram page.

## Undo
git revert -m 1 HEAD
git push origin main
(Database changes stay; they only add tables and columns and do not break the old version.)

## After go-live
- Add the shop WhatsApp number on the Catalogue page; switch products on for the shop.
- Meta Commerce Manager: add the feed https://accounting.abhiraminc.com/shop/feed.csv (steps on the Catalogue page).
- Meta webhook for staff messages: https://accounting.abhiraminc.com/api/whatsapp/webhook
