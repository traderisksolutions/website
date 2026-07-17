-- Let a saved draft carry attachments (e.g. generated Pricing-Matrix quote files) so the
-- reply composer can pre-load and send them. Each item: { filename, mime_type, storage_url }
-- where storage_url is a bare path in the private `email-attachments` bucket.
ALTER TABLE ai_drafts
  ADD COLUMN IF NOT EXISTS attachments jsonb;
