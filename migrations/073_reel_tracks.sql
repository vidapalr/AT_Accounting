-- 073: licence-free music tracks the owner uploads, to put under reels made from product photos.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS acct_reel_tracks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  legal_business_id BIGINT UNSIGNED NOT NULL,
  track_name VARCHAR(120) NOT NULL,
  storage_key VARCHAR(80) NOT NULL,
  mime_type VARCHAR(60) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reel_tracks (legal_business_id, status)
);
