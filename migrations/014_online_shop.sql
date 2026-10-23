-- 014: online shop. A product only appears on /shop when the owner switches it on.
-- Safe to run more than once (needs MariaDB 10.0.2+).

ALTER TABLE acct_products
  ADD COLUMN IF NOT EXISTS show_in_shop TINYINT(1) NOT NULL DEFAULT 0;
