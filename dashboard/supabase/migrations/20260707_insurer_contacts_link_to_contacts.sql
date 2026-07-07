-- Insurer directory → single-contact model.
-- insurer_contacts stops storing name/email and becomes a LINK table into the
-- shared contacts table (Active Contacts) — the single source of truth for people.
-- Adds a role_title on the link. Run this in the Supabase SQL editor.

-- 1. Every directory email must exist as a contact (source of truth). Fill-only.
--    contacts stores first_name / last_name, so split the stored contact_name on
--    its first space (single-token names land entirely in first_name).
with src as (
  select distinct
    lower(trim(contact_email))               as email,
    nullif(trim(coalesce(contact_name, '')), '') as nm
  from insurer_contacts
  where contact_email is not null and trim(contact_email) <> ''
)
insert into contacts (email, first_name, last_name, source)
select
  email,
  nullif(split_part(nm, ' ', 1), ''),
  case when position(' ' in nm) > 0
       then nullif(trim(substring(nm from position(' ' in nm) + 1)), '')
       else null end,
  'manual'
from src
on conflict (email) do nothing;

-- 2. Add the link + role columns.
alter table insurer_contacts
  add column if not exists contact_id uuid references contacts(id) on delete cascade,
  add column if not exists role_title text;

-- 3. Backfill the link from email.
update insurer_contacts ic
set contact_id = c.id
from contacts c
where c.email = lower(trim(ic.contact_email))
  and ic.contact_id is null;

-- 4. Drop any directory rows that never had a resolvable email (orphans).
delete from insurer_contacts where contact_id is null;

-- 5. Drop the old duplicated columns (their unique constraint drops with them).
alter table insurer_contacts
  drop column if exists contact_name,
  drop column if exists contact_email;

-- 6. New uniqueness on the link + a lookup index.
alter table insurer_contacts
  add constraint insurer_contacts_link_key unique (insurer_id, product_line, contact_id);

create index if not exists insurer_contacts_contact_id_idx on insurer_contacts(contact_id);
