# Saving the database structure (one-time, about 3 minutes)

> Historical request: the structure has since been committed as `db/base_schema_2026-10-28.sql` (through migration 040). See [current database documentation](current/DATABASE_DICTIONARY.md) and [setup guidance](current/OPERATIONS.md). The text below records the earlier request, not the current repository state.

The repository has the changes (migrations 001 onward) but not the original table layout, so a brand new copy cannot be built from the repository alone.

1. Open phpMyAdmin and click your accounting database.
2. Click **Export** → choose **Custom**.
3. Under *Output*, tick nothing special. Under **Format-specific options**, set **Data creation options** to **Structure only** (no data).
4. Under *Object creation options*, tick **Add DROP TABLE** is NOT needed; tick **Add CREATE TRIGGER** if shown.
5. Press **Export** and send the file here (it holds table layouts only, no business data).

It will be committed as `migrations/000_base_schema.sql` so a test copy can be built from the repository and the restore can be tested.
