-- Add sending_email (the FROM address this signature is tied to, 1:1)
-- and owner_user_id (null = shared alias managed by admin, non-null = personal Gmail)
ALTER TABLE user_signatures
  ADD COLUMN IF NOT EXISTS sending_email text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

-- Soft-unique: only one active signature per sending address
CREATE UNIQUE INDEX IF NOT EXISTS user_signatures_sending_email_uq
  ON user_signatures (sending_email)
  WHERE deleted_at IS NULL;
