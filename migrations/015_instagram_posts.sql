-- 015: history of posts sent to Instagram from the app. Safe to run more than once.
CREATE TABLE IF NOT EXISTS acct_instagram_posts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  media_id BIGINT UNSIGNED NOT NULL,
  caption VARCHAR(2200) NOT NULL,
  status ENUM('POSTED','FAILED') NOT NULL,
  instagram_media_id VARCHAR(40) DEFAULT NULL,
  error_text VARCHAR(300) DEFAULT NULL,
  created_by BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ig_product (legal_business_id, product_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
