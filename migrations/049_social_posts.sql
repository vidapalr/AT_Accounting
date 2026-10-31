-- 049: the posting log now covers Facebook too and posts with several photos. Safe to run twice.
ALTER TABLE acct_instagram_posts
  ADD COLUMN IF NOT EXISTS channel ENUM('INSTAGRAM','FACEBOOK') NOT NULL DEFAULT 'INSTAGRAM',
  ADD COLUMN IF NOT EXISTS media_count INT UNSIGNED NOT NULL DEFAULT 1;
