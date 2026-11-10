# HTTP endpoint catalogue

Static source inventory. A named guard is evidence of a call, not proof of complete authorization. Webhooks and scheduled endpoints can use token/signature authentication instead of sessions. Review the linked implementation before calling any endpoint.

| Route | Methods | Source | Authentication-related calls | Direct tables |
| --- | --- | --- | --- | --- |
| `/api/accounting/inventory-history` | GET | [src/app/api/accounting/inventory-history/route.ts](../../src/app/api/accounting/inventory-history/route.ts) | requireAccess( | acct_inventory_locations, acct_product_variants, acct_stock_movements |
| `/api/agreement-template` | GET | [src/app/api/agreement-template/route.ts](../../src/app/api/agreement-template/route.ts) | requireGroupOwner( |  |
| `/api/audit/export` | GET | [src/app/api/audit/export/route.ts](../../src/app/api/audit/export/route.ts) | getSessionUser( |  |
| `/api/auth/login/code` | POST | [src/app/api/auth/login/code/route.ts](../../src/app/api/auth/login/code/route.ts) | Inspect source |  |
| `/api/auth/login` | POST | [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts) | verifyCredentials( |  |
| `/api/auth/logout` | POST | [src/app/api/auth/logout/route.ts](../../src/app/api/auth/logout/route.ts) | Inspect source |  |
| `/api/backup/files` | GET | [src/app/api/backup/files/route.ts](../../src/app/api/backup/files/route.ts) | getSessionUser( | acct_audit_events |
| `/api/backup` | GET | [src/app/api/backup/route.ts](../../src/app/api/backup/route.ts) | getSessionUser( | acct_audit_events |
| `/api/bank-evidence/[id]/view` | GET | [src/app/api/bank-evidence/[id]/view/route.ts](../../src/app/api/bank-evidence/[id]/view/route.ts) | requireGroupOwner( | acct_bank_accounts, acct_bank_evidence |
| `/api/catalogue/media/[id]` | GET | [src/app/api/catalogue/media/[id]/route.ts](../../src/app/api/catalogue/media/[id]/route.ts) | getSessionUser( | acct_product_media |
| `/api/catalogue/media/bulk` | POST | [src/app/api/catalogue/media/bulk/route.ts](../../src/app/api/catalogue/media/bulk/route.ts) | getSessionUser( | acct_product_media, acct_products |
| `/api/catalogue/media` | POST | [src/app/api/catalogue/media/route.ts](../../src/app/api/catalogue/media/route.ts) | getSessionUser( | acct_product_media, acct_products |
| `/api/catalogue/reels/music/[id]` | GET | [src/app/api/catalogue/reels/music/[id]/route.ts](../../src/app/api/catalogue/reels/music/[id]/route.ts) | getSessionUser( | acct_reel_tracks |
| `/api/catalogue/reels/music` | POST | [src/app/api/catalogue/reels/music/route.ts](../../src/app/api/catalogue/reels/music/route.ts) | getSessionUser( | acct_reel_tracks |
| `/api/catalogue/reels` | POST | [src/app/api/catalogue/reels/route.ts](../../src/app/api/catalogue/reels/route.ts) | getSessionUser( | acct_product_media, acct_products |
| `/api/dev/db-check` | GET | [src/app/api/dev/db-check/route.ts](../../src/app/api/dev/db-check/route.ts) | Inspect source |  |
| `/api/dev/schema-check` | GET | [src/app/api/dev/schema-check/route.ts](../../src/app/api/dev/schema-check/route.ts) | Inspect source |  |
| `/api/documents/[id]/download` | GET | [src/app/api/documents/[id]/download/route.ts](../../src/app/api/documents/[id]/download/route.ts) | Inspect source |  |
| `/api/documents/[id]/preview` | GET | [src/app/api/documents/[id]/preview/route.ts](../../src/app/api/documents/[id]/preview/route.ts) | requireGroupOwner( | acct_business_documents |
| `/api/documents/[id]` | GET | [src/app/api/documents/[id]/route.ts](../../src/app/api/documents/[id]/route.ts) | getCurrentUser( |  |
| `/api/documents` | POST | [src/app/api/documents/route.ts](../../src/app/api/documents/route.ts) | getCurrentUser( | acct_audit_events, acct_business_documents, acct_divisions |
| `/api/ledger/auto-post` | GET, POST | [src/app/api/ledger/auto-post/route.ts](../../src/app/api/ledger/auto-post/route.ts) | authorised( |  |
| `/api/reports/export` | GET | [src/app/api/reports/export/route.ts](../../src/app/api/reports/export/route.ts) | getSessionUser( |  |
| `/api/shop/account/forgot` | POST | [src/app/api/shop/account/forgot/route.ts](../../src/app/api/shop/account/forgot/route.ts) | Inspect source |  |
| `/api/shop/account/login` | POST | [src/app/api/shop/account/login/route.ts](../../src/app/api/shop/account/login/route.ts) | Inspect source |  |
| `/api/shop/account/logout` | POST | [src/app/api/shop/account/logout/route.ts](../../src/app/api/shop/account/logout/route.ts) | Inspect source |  |
| `/api/shop/account/register` | POST | [src/app/api/shop/account/register/route.ts](../../src/app/api/shop/account/register/route.ts) | Inspect source |  |
| `/api/shop/account/reset` | POST | [src/app/api/shop/account/reset/route.ts](../../src/app/api/shop/account/reset/route.ts) | Inspect source |  |
| `/api/shop/account/verify-resend` | POST | [src/app/api/shop/account/verify-resend/route.ts](../../src/app/api/shop/account/verify-resend/route.ts) | getShopCustomer( |  |
| `/api/shop/cart` | POST | [src/app/api/shop/cart/route.ts](../../src/app/api/shop/cart/route.ts) | Inspect source |  |
| `/api/shop/media/[id]` | GET | [src/app/api/shop/media/[id]/route.ts](../../src/app/api/shop/media/[id]/route.ts) | Inspect source | acct_product_media, acct_products |
| `/api/shop/order` | POST | [src/app/api/shop/order/route.ts](../../src/app/api/shop/order/route.ts) | getShopCustomer( |  |
| `/api/whatsapp/preview` | GET | [src/app/api/whatsapp/preview/route.ts](../../src/app/api/whatsapp/preview/route.ts) | getSessionUser( | acct_whatsapp_recipients, acct_whatsapp_subscriptions |
| `/api/whatsapp/run` | GET, POST | [src/app/api/whatsapp/run/route.ts](../../src/app/api/whatsapp/run/route.ts) | authorised( |  |
| `/api/whatsapp/webhook` | GET, POST | [src/app/api/whatsapp/webhook/route.ts](../../src/app/api/whatsapp/webhook/route.ts) | Inspect source | acct_customers, acct_wa_delivery, acct_wa_status_log |
| `/shop/feed.csv` | GET | [src/app/shop/feed.csv/route.ts](../../src/app/shop/feed.csv/route.ts) | Inspect source |  |

