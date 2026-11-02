-- 053: the cashier decides on each return whether the delivery charge is given back too.
-- delivery_value = the delivery charge handed back on that return (0 = not given back).
-- Returns made before this change keep 0. Safe to run twice.
ALTER TABLE acct_sales_returns
  ADD COLUMN IF NOT EXISTS delivery_value DECIMAL(18,2) NOT NULL DEFAULT 0.00;
