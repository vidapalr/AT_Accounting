-- 029: Manager and investor logins
--
-- * scope_division_id: a Manager works inside one division only.
-- * party_id: an Investor login is tied to one investor (funding party) and sees only that
--   investor's own agreements, money in and out, and profit share.
-- The roles themselves (DIVISION_MANAGER, INVESTOR) already exist in the access list.
--
-- Idempotent: safe to run more than once.

ALTER TABLE acct_user_access ADD COLUMN IF NOT EXISTS scope_division_id BIGINT UNSIGNED NULL;
ALTER TABLE acct_user_access ADD COLUMN IF NOT EXISTS party_id BIGINT UNSIGNED NULL;
