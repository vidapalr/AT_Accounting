-- 097: A return clears what was still unpaid on its own bill first (one-time fix for past returns).
-- Before: a bill with money still due and a return on it showed both "outstanding" on the bill and
-- "we owe the customer" for the return. This records the set-off as an exchange payment from the
-- return (no cash moves, no journal: the books already had it right), so the bill, the return and the
-- customer's balance agree. New returns do this by themselves when they are saved.
-- Safe to run more than once: it only takes what is still unpaid and still left on the return.
-- (A bill with two returns: run it a second time.)

INSERT INTO acct_sales_payments
  (legal_business_id, division_id, sale_id, payment_date, payment_method, payment_account_type,
   amount, remarks, status, created_by, exchange_return_id)
SELECT x.legal_business_id, x.division_id, x.sale_id, x.return_date, 'EXCHANGE', 'OTHERS',
       LEAST(x.unpaid, x.available), CONCAT('Unpaid amount cleared by return ', x.return_no), 'RECORDED', x.created_by, x.return_id
  FROM (
    SELECT z.*, ROW_NUMBER() OVER (PARTITION BY z.sale_id ORDER BY z.return_id) AS rn
      FROM (
        SELECT r.legal_business_id, h.division_id, r.sale_id, r.return_date, r.return_no, r.created_by, r.id AS return_id,
               h.grand_total - COALESCE((SELECT SUM(p.amount) FROM acct_sales_payments p
                                          WHERE p.legal_business_id = h.legal_business_id AND p.sale_id = h.id AND p.status = 'RECORDED'), 0) AS unpaid,
               r.refund_value
                 - COALESCE((SELECT SUM(f.amount) FROM acct_sales_refunds f WHERE f.return_id = r.id AND f.status = 'RECORDED'), 0)
                 - COALESCE((SELECT SUM(e.amount) FROM acct_sales_payments e WHERE e.exchange_return_id = r.id AND e.status = 'RECORDED'), 0) AS available
          FROM acct_sales_returns r
          JOIN acct_sales_headers h ON h.id = r.sale_id AND h.legal_business_id = r.legal_business_id
         WHERE r.status = 'POSTED' AND h.status = 'POSTED'
      ) z
     WHERE z.unpaid > 0 AND z.available > 0
  ) x
 WHERE x.rn = 1;
