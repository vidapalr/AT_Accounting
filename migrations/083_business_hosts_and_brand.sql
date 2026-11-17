-- 083: Many companies in one app (step 1) and brand settings.
-- (a) acct_business_hosts links a web address to a company, so login, the shop and the chatbot
--     know which company a visitor belongs to. Addresses not listed use the first company.
-- (b) Brand words, phone numbers and logos move from the code into acct_business_settings
--     (shown on Set-up > Group details > Brand). Values below are today's printed values.
-- Idempotent: safe to run more than once. Nothing is posted and no figures change.

CREATE TABLE IF NOT EXISTS acct_business_hosts (
  host VARCHAR(190) NOT NULL,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  purpose ENUM('APP','SHOP') NOT NULL DEFAULT 'APP',
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (host),
  KEY idx_business_hosts_business (legal_business_id, purpose),
  CONSTRAINT fk_business_hosts_business FOREIGN KEY (legal_business_id) REFERENCES acct_legal_businesses (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Today's two addresses belong to the first company.
INSERT IGNORE INTO acct_business_hosts (host, legal_business_id, purpose)
SELECT 'accounting.abhiraminc.com', MIN(id), 'APP' FROM acct_legal_businesses HAVING MIN(id) IS NOT NULL;
INSERT IGNORE INTO acct_business_hosts (host, legal_business_id, purpose)
SELECT 'textiles.abhiraminc.com', MIN(id), 'SHOP' FROM acct_legal_businesses HAVING MIN(id) IS NOT NULL;

-- Brand settings for the first company (exactly what is printed today).
INSERT IGNORE INTO acct_business_settings (legal_business_id, setting_key, setting_value)
SELECT b.id, s.k, s.v
  FROM (SELECT MIN(id) AS id FROM acct_legal_businesses) b
  JOIN (
    SELECT 'brand_group_name' AS k, 'Abhiram Group' AS v UNION ALL
    SELECT 'brand_shop_name', 'Abhiram Textiles' UNION ALL
    SELECT 'brand_tagline', 'Elegance in every thread' UNION ALL
    SELECT 'brand_place', 'Kapra, Hyderabad' UNION ALL
    SELECT 'brand_description', 'Your neighbourhood women''s wear shop in Kapra, Hyderabad: comfortable cotton sets, everyday essentials and traditional sarees.' UNION ALL
    SELECT 'brand_parent_line', 'An Abhiram Group company' UNION ALL
    SELECT 'brand_watermark', 'Abhiram Textiles | An Abhiram Group' UNION ALL
    SELECT 'brand_shop_phone', '9640976976' UNION ALL
    SELECT 'brand_owner_phone', '7416516574' UNION ALL
    SELECT 'brand_email', 'textiles@abhiraminc.com' UNION ALL
    SELECT 'brand_websites', 'textiles.abhiraminc.com / abhiraminc.com' UNION ALL
    SELECT 'brand_app_name', 'Abhiram Group Accounting' UNION ALL
    SELECT 'shop_nav_links', 'Sarees|saree; Cotton sets|cotton' UNION ALL
    SELECT 'agreement_business_party', 'Ravi Shanker Vidapalapati, proprietor, carrying on business as Abhiram Group' UNION ALL
    SELECT 'agreement_template_file', 'Abhiram_Group_Profit_Participation_Agreement.docx'
  ) s
 WHERE b.id IS NOT NULL;
