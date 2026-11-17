# Running the app for another company

One copy of the app can serve several companies. Each company is a row in `acct_legal_businesses`; every record carries `legal_business_id`.

## How the app knows the company

1. **Web address.** `acct_business_hosts` links an address to a company (`accounting.acme.in` -> company 7, `shop.acme.in` -> company 7). Sign-in, the session, the shop and the chatbot use it (`src/lib/tenant.ts`).
2. **WhatsApp number.** The setting `wa_phone_number_id` links a WhatsApp business number to a company, for the webhook.
3. **Default.** Anything else uses `DEFAULT_BUSINESS_ID`, or the first company. A single-company installation needs nothing.

Scheduled jobs (automatic posting, WhatsApp reports) run for every company in turn.

## Adding a company (today, by hand; a sign-up wizard is on the roadmap)

1. Run `scripts/setup-business.mjs` for the new company, then `scripts/create-owner.mjs` for its owner.
2. Add its addresses: `INSERT INTO acct_business_hosts (host, legal_business_id, purpose) VALUES ('accounting.acme.in', 7, 'APP'), ('shop.acme.in', 7, 'SHOP');`
3. Point the domains at the hosting and add them to `APP_HOSTS` / `SHOP_HOSTS` (same order, one pair per company).
4. The owner signs in and fills **Set-up > Brand and modules** (name, phone, logo, website words, parts of the app in use) and, if their accountant uses other account codes, **Accounting > Account mapping**.
5. Staff letters: **Staff > Letter templates**.

## Still shared by all companies on one installation (roadmap)

- WhatsApp, Instagram, Facebook and email keys are server settings (one set). Per-company keys should move to the database, encrypted like bank numbers (`bank-crypto.ts`).
- The SQL backup downloads the whole database; a per-company export is needed before hosting unrelated companies together.
- Country code 91, Indian time and rupees are assumed throughout.
- Product attributes are size, colour and fabric; other trades need custom attribute sets.
- There is no starter chart of accounts for a brand-new company yet; it must be loaded before posting.
