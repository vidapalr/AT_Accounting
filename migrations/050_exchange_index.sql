-- 050: an index so that using or refunding a return's credit only locks that return's own payments. Safe to run twice.
ALTER TABLE acct_sales_payments
  ADD INDEX IF NOT EXISTS idx_sales_payments_exchange_return (exchange_return_id);
