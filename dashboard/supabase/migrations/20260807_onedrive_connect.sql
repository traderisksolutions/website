-- OneDrive connection for historical debit-note bulk import (Microsoft Graph, delegated OAuth).
-- Mirrors the existing Gmail connection columns on employee_profiles (gmail_refresh_token,
-- gmail_connected_at) exactly — same pattern, same table, just a Microsoft account instead of a
-- Google one. Run in the Supabase SQL editor.

ALTER TABLE "public"."employee_profiles"
  ADD COLUMN IF NOT EXISTS "onedrive_refresh_token" "text",
  ADD COLUMN IF NOT EXISTS "onedrive_account_email" "text",
  ADD COLUMN IF NOT EXISTS "onedrive_connected_at"  timestamp with time zone;
