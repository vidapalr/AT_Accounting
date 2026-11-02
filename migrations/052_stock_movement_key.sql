-- 052: allow a second partial return of the same invoice line.
-- The stock history had one rule too strict: only one stock record per invoice line per kind of movement.
-- A customer returning one of two pieces twice was refused with "Could not save the return".
-- The rule now also looks at which return (or bill) the record belongs to. Safe to run twice.
ALTER TABLE acct_stock_movements
  DROP INDEX IF EXISTS uq_stock_source_line_movement,
  DROP INDEX IF EXISTS uq_stock_source_line_v2,
  ADD UNIQUE INDEX uq_stock_source_line_v2 (legal_business_id, movement_type, source_type, source_id, source_line_id);
