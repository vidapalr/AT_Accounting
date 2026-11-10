-- 075: pay a supplier in one amount. The parts paid against each bill share one batch number.
-- Safe to run twice.
ALTER TABLE acct_purchase_payments ADD COLUMN IF NOT EXISTS batch_no VARCHAR(40) NULL;
ALTER TABLE acct_purchase_payments ADD INDEX IF NOT EXISTS idx_pp_batch (legal_business_id, batch_no);
