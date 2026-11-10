# Setup and operations

## Local development

Use an isolated development/test database. Configure secrets outside version control. `src/lib/db.ts` uses `DB_HOST`, `DB_PORT` (default 3306), `DB_DATABASE`, `DB_USERNAME` and `DB_PASSWORD`. No connection settings were inspected during this documentation work.

```powershell
cd E:\Projects\abhiram-accounting
npm.cmd ci
npm.cmd run dev
```

Use a Node version compatible with the installed Next.js package and native TypeScript test execution. Inspect `node_modules/next/package.json` engines when provisioning. The current test command uses `node --test tests/*.test.mjs`.

The application needs SQL schema and setup records before authenticated pages can work. `scripts/setup-business.mjs` and `scripts/create-owner.mjs` are setup utilities that write data; read their prompts and requirements before executing. They were not run in this review.

## Database setup

The base file `db/base_schema_2026-10-28.sql` is a structure-only dump, documented as including migrations through 040: 106 tables and five journal guard triggers. For a **new empty database**, load that base and then apply 041 through 078 in numeric order. Structure-only does not guarantee all business/settings/chart seed data required by a workflow exists.

Do not load the base into an existing production database. For an existing installation, inspect schema and actual applied changes before applying any migration. Some migrations contain data updates, so a blanket claim that every replay is harmless is insufficient. SQL syntax includes MariaDB-style `IF NOT EXISTS`; validate against the actual server version.

`src/lib/migration-check.ts` checks selected table, column and index markers. It is a readiness hint, not a complete migration ledger: one marker does not prove every statement or backfill in that file succeeded. In particular, the 078 marker checks `follow_up_on`, while that migration also adds `kind`, `follow_done_at` and an index.

Compare the resulting schema with the [DDL history](DATABASE_DICTIONARY.md), then verify triggers, unique constraints, seed accounts and an empty transaction round trip. A restore/setup rehearsal has not been performed as part of this delivery.

## Runtime dependencies and configuration

| Area | Configuration or dependency |
| --- | --- |
| SQL | DB variables above and a compatible MariaDB server |
| Bank account encryption | `BANK_ENCRYPTION_KEY` and `BANK_FINGERPRINT_KEY`, each a 32-byte hex key; preserve keys securely across deployments/restores |
| Product media | `MEDIA_DIR`; use persistent storage outside the replaced application release folder |
| Private documents | Currently hard-coded to `<process.cwd()>/private_uploads`; provision persistence or fix storage configuration before relying on redeploy survival |
| Host routing | `ACCOUNTING_HOST`, `TEXTILES_HOST`; login routes also contain production-origin assumptions |
| Public URLs | `SHOP_PUBLIC_URL`, `SHOP_BUSINESS_ID`; verify links from actual public hosts |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, optional `SHOP_NOTIFY_EMAIL` |
| Scheduled tasks | `CRON_SECRET`; ledger and WhatsApp run endpoints can create postings or send messages |
| WhatsApp | Provider, number ID, access token, webhook verify token and app secret as required by the selected provider |
| Instagram/Facebook | Account/page IDs and access tokens; credentials do not prove publication permission or successful delivery |
| Agreement conversion | LibreOffice executable configured with `LIBREOFFICE_PATH` where needed |
| File backup | Host `tar` executable and read access to persisted upload/media paths |

See [ENVIRONMENT.md](ENVIRONMENT.md) for source locations. Keep credentials out of screenshots, examples, commits and exported documentation. This reference contains names only.

## Backup and restore

The SQL backup selects accounting tables and excludes `acct_sessions`. It uses a consistent snapshot, emits table definitions and data, and attempts to include triggers. Trigger export failures are converted to a comment, so verify the backup's reported trigger count and content before treating it as recoverable. Other customer sessions/token tables are not excluded by the single staff-session exclusion.

The uploaded-file backup is separate from SQL. It archives `private_uploads` and configured media storage. Downloading SQL alone does not preserve agreement files, bank evidence or product media. Preserve encryption keys separately. Test restore into an isolated environment, check table/trigger counts, verify encrypted account handling, open sample private documents/media and reconcile balances. Disable external messaging and schedulers in that test environment.

The generated SQL backup includes DROP TABLE statements; restoring it replaces those tables. This documentation does not authorize a production restore.

## Release checks

1. Record the commit and pending migration list; back up database, uploaded files and required secrets.
2. Apply pending migrations to a test copy and verify all statements, constraints, backfills and triggers.
3. Run automated checks and the [acceptance scenarios](ACCEPTANCE.md), including role restrictions and ledger reconciliation.
4. Verify persistent storage, public origins, scheduler configuration and optional provider settings.
5. Apply only the reviewed production migrations and deploy the reviewed application release when authorized.
6. Check login, billing, a document, shop access, posting health and backup availability; compare representative balances.

The repository's standing release notes identify `main` as the auto-deploy branch and `feat/ledger-dry-run` as the working branch. No branch switch, pull, merge, push or deployment was performed for this documentation change. Reverting code does not reverse a database migration.

## Validation commands

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Read the current [review results](REVIEW.md) before assuming these checks pass. Integration tests in `agreement-versions.integration.test.mjs` require an explicitly isolated `_test` database and write/delete fixture rows. Do not enable them against real business data. A production build and authenticated browser pass were not run in this documentation review.
