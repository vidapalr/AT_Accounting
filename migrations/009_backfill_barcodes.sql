-- 009: give every product variant that has no barcode a shop barcode (EAN-13, 200 range).
-- Safe to run twice: only variants without a barcode are touched.
UPDATE acct_product_variants v
JOIN (
  SELECT id,
         CONCAT('200', LPAD(id, 9, '0')) AS first12
  FROM acct_product_variants
  WHERE barcode IS NULL OR barcode = ''
) x ON x.id = v.id
SET v.barcode = CONCAT(
  x.first12,
  MOD(10 - MOD(
      CAST(SUBSTRING(x.first12, 1, 1) AS UNSIGNED)
    + CAST(SUBSTRING(x.first12, 2, 1) AS UNSIGNED) * 3
    + CAST(SUBSTRING(x.first12, 3, 1) AS UNSIGNED)
    + CAST(SUBSTRING(x.first12, 4, 1) AS UNSIGNED) * 3
    + CAST(SUBSTRING(x.first12, 5, 1) AS UNSIGNED)
    + CAST(SUBSTRING(x.first12, 6, 1) AS UNSIGNED) * 3
    + CAST(SUBSTRING(x.first12, 7, 1) AS UNSIGNED)
    + CAST(SUBSTRING(x.first12, 8, 1) AS UNSIGNED) * 3
    + CAST(SUBSTRING(x.first12, 9, 1) AS UNSIGNED)
    + CAST(SUBSTRING(x.first12, 10, 1) AS UNSIGNED) * 3
    + CAST(SUBSTRING(x.first12, 11, 1) AS UNSIGNED)
    + CAST(SUBSTRING(x.first12, 12, 1) AS UNSIGNED) * 3
  , 10), 10)
);
