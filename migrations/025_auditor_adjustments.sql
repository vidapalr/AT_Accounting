-- 025: Adjustment entries asked for by the auditor
-- One row per adjustment (ADJ-0001); the ledger entry itself is posted like any other
-- and linked by source type AUDITOR_ADJUSTMENT. Run once.

CREATE TABLE IF NOT EXISTS acct_auditor_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  adjustment_no VARCHAR(60) NOT NULL,
  entry_date DATE NOT NULL,
  reason VARCHAR(300) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_auditor_adjustment_no (legal_business_id, adjustment_no)
);
