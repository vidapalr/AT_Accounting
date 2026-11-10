-- 078: a note on a customer can be a call/visit/message and carry a follow-up day. Safe to run twice.
ALTER TABLE acct_customer_notes ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'NOTE';
ALTER TABLE acct_customer_notes ADD COLUMN IF NOT EXISTS follow_up_on DATE NULL;
ALTER TABLE acct_customer_notes ADD COLUMN IF NOT EXISTS follow_done_at DATETIME NULL;
ALTER TABLE acct_customer_notes ADD INDEX IF NOT EXISTS idx_cust_follow (legal_business_id, follow_up_on, follow_done_at);
