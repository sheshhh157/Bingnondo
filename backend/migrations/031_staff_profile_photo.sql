ALTER TABLE staff_accounts
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_image_public_id TEXT;
