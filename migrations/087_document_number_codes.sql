-- 087: Document numbers no longer have the company and division letters fixed in code.
-- Numbers look like AB_AT_KA_SA_0123: company code, division code, branch letters, kind of paper.
-- This keeps the first company's existing numbers running on (AB for the company, AT for its
-- divisions), so no number changes and none is reused. New companies and divisions get their
-- letters from their names, or from these settings (Set-up > Brand and modules).
-- Idempotent: safe to run more than once.

INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT b.id, 'doc_business_code', 'AB'
  FROM (SELECT MIN(id) AS id FROM acct_legal_businesses) b
 WHERE b.id IS NOT NULL;

INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT d.legal_business_id, CONCAT('doc_division_code_', d.id), 'AT'
  FROM acct_divisions d
 WHERE d.legal_business_id = (SELECT MIN(id) FROM acct_legal_businesses);
