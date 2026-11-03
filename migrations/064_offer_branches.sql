-- 064: Offers and coupons for one branch or a whole division (owner, 3 Nov 2026)
-- branch_id set      -> only that branch
-- division_id set    -> every branch of that division (points can still be used anywhere)
-- both empty         -> everywhere (what existing offers and coupons keep doing)
-- Idempotent: safe to run more than once.

ALTER TABLE acct_offers ADD COLUMN IF NOT EXISTS division_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_offers ADD COLUMN IF NOT EXISTS branch_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_coupons ADD COLUMN IF NOT EXISTS division_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_coupons ADD COLUMN IF NOT EXISTS branch_id BIGINT UNSIGNED NULL;
