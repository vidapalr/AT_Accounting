-- 021: Discount given to close a bill (for example a customer is short by 50 rupees)
--
-- A discount is stored as a sales "payment" with method DISCOUNT and no bank or cash
-- account, so every dues figure (bill total minus payments) stays right. It posts to
-- Sales Discounts, never to cash or bank.
--
-- Idempotent: safe to run more than once.

ALTER TABLE acct_sales_payments
  MODIFY payment_method ENUM('CASH','UPI','BANK_TRANSFER','CARD','OTHER','DISCOUNT') NOT NULL;
