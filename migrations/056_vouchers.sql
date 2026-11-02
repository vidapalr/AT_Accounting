-- 056: payment vouchers. One numbered voucher per paid expense payment, numbered by financial year and type
-- (CPV cash, BPV bank, OPV paid from the owner's own money, IPV paid from an investor's money).
-- A voucher is made the first time it is printed and keeps its number. Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_vouchers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  voucher_no VARCHAR(40) NOT NULL,
  voucher_type ENUM('CPV','BPV','OPV','IPV') NOT NULL,
  financial_year VARCHAR(8) NOT NULL,
  seq INT UNSIGNED NOT NULL,
  expense_payment_id BIGINT UNSIGNED NOT NULL,
  issued_by BIGINT UNSIGNED NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_voucher_payment (legal_business_id, expense_payment_id),
  UNIQUE KEY uq_voucher_no (legal_business_id, voucher_no),
  UNIQUE KEY uq_voucher_seq (legal_business_id, voucher_type, financial_year, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
