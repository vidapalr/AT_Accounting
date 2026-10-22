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

The base schema (the `acct_*` tables) is not in this repository yet.
Export it with `mysqldump --no-data` and commit it as
`migrations/000_base_schema.sql` so the database can be rebuilt.
