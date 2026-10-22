-- 004: Move the (not yet approved or posted) opening-balance date to 12 Oct 2026
--
-- The business started on 12 Oct 2026, the date of the first expenses and
-- the shop deposit. Only touches a batch that is still DRAFT and unposted.
-- Idempotent.
UPDATE acct_opening_balance_batches
SET opening_date = '2026-10-12'
WHERE status = 'DRAFT'
  AND posted_journal_id IS NULL
  AND opening_date <> '2026-10-12';
