# Database migrations

Plain SQL files, applied in numeric order. Each one is idempotent
(safe to run twice) and must be applied to a **test copy of the
database first**.

| File | Purpose |
| --- | --- |
| `001_investor_capital_account.sql` | Adds ledger account 3200 *Investor Capital* |

Apply with:

```bash
mysql -h <host> -u <user> -p <database> < migrations/001_investor_capital_account.sql
```

Take a database backup before applying to production.

The base schema is saved in `db/base_schema_2026-10-28.sql` (accounting tables only, current through
migration 040). To build a brand new empty database, load that file, then apply any migration numbered
above 040. Do not run the older migrations after it. Loading it into an empty database gives 106 tables
and 5 triggers. Do not load it into the live database.
