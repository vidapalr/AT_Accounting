# Environment-variable reference

Names and usage locations only; no environment files or secret values were read. Required/default/optional behavior is determined by each linked module. Includes `process.env.NAME` and the `env.NAME` alias used by db.ts; computed names can be missed.

| Variable | Referenced by |
| --- | --- |
| `ACCOUNTING_DIVISION_CODE` | [scripts/setup-business.mjs](../../scripts/setup-business.mjs) |
| `ACCOUNTING_DIVISION_NAME` | [scripts/setup-business.mjs](../../scripts/setup-business.mjs) |
| `ACCOUNTING_HOST` | [src/proxy.ts](../../src/proxy.ts) |
| `ACCOUNTING_LEGAL_NAME` | [scripts/setup-business.mjs](../../scripts/setup-business.mjs) |
| `ACCOUNTING_TRADING_NAME` | [scripts/setup-business.mjs](../../scripts/setup-business.mjs) |
| `BANK_ENCRYPTION_KEY` | [src/lib/bank-crypto.ts](../../src/lib/bank-crypto.ts) |
| `BANK_FINGERPRINT_KEY` | [src/lib/bank-crypto.ts](../../src/lib/bank-crypto.ts) |
| `CRON_SECRET` | [src/app/api/ledger/auto-post/route.ts](../../src/app/api/ledger/auto-post/route.ts), [src/app/api/whatsapp/run/route.ts](../../src/app/api/whatsapp/run/route.ts) |
| `DB_DATABASE` | [scripts/create-owner.mjs](../../scripts/create-owner.mjs), [scripts/ledger-dry-run.ts](../../scripts/ledger-dry-run.ts), [scripts/ledger-post.ts](../../scripts/ledger-post.ts), [scripts/setup-business.mjs](../../scripts/setup-business.mjs), [scripts/verify-funding-policies.mjs](../../scripts/verify-funding-policies.mjs), [scripts/verify-funding-schema.mjs](../../scripts/verify-funding-schema.mjs), [src/lib/db.ts](../../src/lib/db.ts), [tests/agreement-versions.integration.test.mjs](../../tests/agreement-versions.integration.test.mjs) |
| `DB_HOST` | [scripts/create-owner.mjs](../../scripts/create-owner.mjs), [scripts/ledger-dry-run.ts](../../scripts/ledger-dry-run.ts), [scripts/ledger-post.ts](../../scripts/ledger-post.ts), [scripts/setup-business.mjs](../../scripts/setup-business.mjs), [scripts/verify-funding-policies.mjs](../../scripts/verify-funding-policies.mjs), [scripts/verify-funding-schema.mjs](../../scripts/verify-funding-schema.mjs), [src/lib/db.ts](../../src/lib/db.ts) |
| `DB_PASSWORD` | [scripts/create-owner.mjs](../../scripts/create-owner.mjs), [scripts/ledger-dry-run.ts](../../scripts/ledger-dry-run.ts), [scripts/ledger-post.ts](../../scripts/ledger-post.ts), [scripts/setup-business.mjs](../../scripts/setup-business.mjs), [scripts/verify-funding-policies.mjs](../../scripts/verify-funding-policies.mjs), [scripts/verify-funding-schema.mjs](../../scripts/verify-funding-schema.mjs), [src/lib/db.ts](../../src/lib/db.ts) |
| `DB_PORT` | [scripts/create-owner.mjs](../../scripts/create-owner.mjs), [scripts/ledger-dry-run.ts](../../scripts/ledger-dry-run.ts), [scripts/ledger-post.ts](../../scripts/ledger-post.ts), [scripts/setup-business.mjs](../../scripts/setup-business.mjs), [scripts/verify-funding-policies.mjs](../../scripts/verify-funding-policies.mjs), [scripts/verify-funding-schema.mjs](../../scripts/verify-funding-schema.mjs), [src/lib/db.ts](../../src/lib/db.ts) |
| `DB_SOCKET` | [scripts/ledger-dry-run.ts](../../scripts/ledger-dry-run.ts), [scripts/ledger-post.ts](../../scripts/ledger-post.ts) |
| `DB_USERNAME` | [scripts/create-owner.mjs](../../scripts/create-owner.mjs), [scripts/ledger-dry-run.ts](../../scripts/ledger-dry-run.ts), [scripts/ledger-post.ts](../../scripts/ledger-post.ts), [scripts/setup-business.mjs](../../scripts/setup-business.mjs), [scripts/verify-funding-policies.mjs](../../scripts/verify-funding-policies.mjs), [scripts/verify-funding-schema.mjs](../../scripts/verify-funding-schema.mjs), [src/lib/db.ts](../../src/lib/db.ts) |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | [src/app/(workspace)/accounting/catalogue/instagram/page.tsx](../../src/app/(workspace)/accounting/catalogue/instagram/page.tsx), [src/lib/social-actions.ts](../../src/lib/social-actions.ts) |
| `FACEBOOK_PAGE_ID` | [src/app/(workspace)/accounting/catalogue/instagram/page.tsx](../../src/app/(workspace)/accounting/catalogue/instagram/page.tsx), [src/lib/social-actions.ts](../../src/lib/social-actions.ts) |
| `GROUP_OWNER_EMAIL` | [scripts/create-owner.mjs](../../scripts/create-owner.mjs) |
| `GROUP_OWNER_NAME` | [scripts/create-owner.mjs](../../scripts/create-owner.mjs) |
| `INSTAGRAM_ACCESS_TOKEN` | [src/app/(workspace)/accounting/catalogue/instagram/page.tsx](../../src/app/(workspace)/accounting/catalogue/instagram/page.tsx), [src/lib/social-actions.ts](../../src/lib/social-actions.ts) |
| `INSTAGRAM_USER_ID` | [src/app/(workspace)/accounting/catalogue/instagram/page.tsx](../../src/app/(workspace)/accounting/catalogue/instagram/page.tsx), [src/lib/social-actions.ts](../../src/lib/social-actions.ts) |
| `LIBREOFFICE_PATH` | [src/lib/agreement-pdf-converter.ts](../../src/lib/agreement-pdf-converter.ts) |
| `MAIL_FROM` | [src/lib/mailer.ts](../../src/lib/mailer.ts) |
| `MEDIA_DIR` | [src/app/api/backup/files/route.ts](../../src/app/api/backup/files/route.ts), [src/lib/media-storage.ts](../../src/lib/media-storage.ts) |
| `NODE_ENV` | [src/app/api/auth/login/code/route.ts](../../src/app/api/auth/login/code/route.ts), [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts), [src/app/api/auth/logout/route.ts](../../src/app/api/auth/logout/route.ts), [src/app/api/dev/db-check/route.ts](../../src/app/api/dev/db-check/route.ts), [src/app/api/dev/schema-check/route.ts](../../src/app/api/dev/schema-check/route.ts), [src/lib/auth.ts](../../src/lib/auth.ts), [src/lib/db.ts](../../src/lib/db.ts), [src/lib/shop-account.ts](../../src/lib/shop-account.ts), [src/lib/two-step-actions.ts](../../src/lib/two-step-actions.ts), [src/lib/two-step.ts](../../src/lib/two-step.ts) |
| `SHOP_BUSINESS_ID` | [src/lib/bot/handle.ts](../../src/lib/bot/handle.ts), [src/lib/shop.ts](../../src/lib/shop.ts) |
| `SHOP_NOTIFY_EMAIL` | [src/lib/order-mail.ts](../../src/lib/order-mail.ts) |
| `SHOP_PUBLIC_URL` | [src/app/(workspace)/accounting/catalogue/instagram/page.tsx](../../src/app/(workspace)/accounting/catalogue/instagram/page.tsx), [src/app/(workspace)/accounting/catalogue/page.tsx](../../src/app/(workspace)/accounting/catalogue/page.tsx), [src/app/(workspace)/accounting/catalogue/share/page.tsx](../../src/app/(workspace)/accounting/catalogue/share/page.tsx), [src/app/shop/feed.csv/route.ts](../../src/app/shop/feed.csv/route.ts), [src/lib/shop-url.ts](../../src/lib/shop-url.ts), [src/lib/social-actions.ts](../../src/lib/social-actions.ts) |
| `SMTP_HOST` | [src/lib/mailer.ts](../../src/lib/mailer.ts) |
| `SMTP_PASS` | [src/lib/mailer.ts](../../src/lib/mailer.ts) |
| `SMTP_PORT` | [src/lib/mailer.ts](../../src/lib/mailer.ts) |
| `SMTP_USER` | [src/lib/mailer.ts](../../src/lib/mailer.ts) |
| `TEXTILES_HOST` | [src/proxy.ts](../../src/proxy.ts) |
| `WHATSAPP_ACCESS_TOKEN` | [src/lib/bot/send.ts](../../src/lib/bot/send.ts), [src/lib/whatsapp/provider.ts](../../src/lib/whatsapp/provider.ts) |
| `WHATSAPP_API_BASE` | [src/lib/bot/send.ts](../../src/lib/bot/send.ts) |
| `WHATSAPP_API_VERSION` | [src/lib/whatsapp/provider.ts](../../src/lib/whatsapp/provider.ts) |
| `WHATSAPP_APP_SECRET` | [src/app/api/whatsapp/webhook/route.ts](../../src/app/api/whatsapp/webhook/route.ts) |
| `WHATSAPP_PHONE_NUMBER_ID` | [src/lib/bot/send.ts](../../src/lib/bot/send.ts), [src/lib/whatsapp/provider.ts](../../src/lib/whatsapp/provider.ts) |
| `WHATSAPP_PROVIDER` | [src/lib/whatsapp/provider.ts](../../src/lib/whatsapp/provider.ts) |
| `WHATSAPP_VERIFY_TOKEN` | [src/app/api/whatsapp/webhook/route.ts](../../src/app/api/whatsapp/webhook/route.ts) |

