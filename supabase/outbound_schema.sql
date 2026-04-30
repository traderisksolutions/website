-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS outbound_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  -- Person or Company
  record_type         text NOT NULL CHECK (record_type IN ('person', 'company')),
  source              text NOT NULL CHECK (source IN ('url_lookup', 'people_search', 'company_search')),

  -- LinkedIn identifiers
  linkedin_id         bigint,
  linkedin_url        text UNIQUE,
  username            text,

  -- Person fields
  first_name          text,
  last_name           text,
  full_name           text,
  headline            text,
  summary             text,
  profile_picture     text,
  location            text,
  country_code        text,

  -- Current position (denormalized from position[0])
  current_title       text,
  current_company     text,
  current_company_id  bigint,
  current_company_url text,
  current_industry    text,

  -- Company fields (when record_type = 'company')
  company_tagline     text,
  company_description text,
  company_size        text,
  employee_count      int,
  headquarters        text,
  logo_url            text,
  website             text,

  -- CRM state
  status              text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'contacted', 'replied', 'qualified', 'disqualified')),
  notes               text,

  -- What search criteria generated this lead
  search_query        jsonb,

  -- Full API response for re-enrichment
  raw_payload         jsonb
);

CREATE INDEX IF NOT EXISTS outbound_leads_status_idx      ON outbound_leads(status);
CREATE INDEX IF NOT EXISTS outbound_leads_record_type_idx ON outbound_leads(record_type);
CREATE INDEX IF NOT EXISTS outbound_leads_created_at_idx  ON outbound_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS outbound_leads_source_idx      ON outbound_leads(source);

CREATE OR REPLACE FUNCTION update_outbound_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER outbound_leads_updated_at
  BEFORE UPDATE ON outbound_leads
  FOR EACH ROW EXECUTE FUNCTION update_outbound_updated_at();
