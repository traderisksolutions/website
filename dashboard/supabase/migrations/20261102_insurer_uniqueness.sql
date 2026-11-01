-- One record per insurer (2 Nov 2026). Liberty and Singlife had been created twice by mail filed
-- under a second domain. The database now refuses a new or renamed insurer whose normalised name,
-- or any of whose domains, already belongs to another insurer. Fires only when name or domains change.
create or replace function public.insurer_norm_name(s text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(lower(coalesce(s, '')),
    '\m(insurance|assurance|singapore|pte|ltd|limited|company|co|general|group|the|private|branch|asia|re)\M', ' ', 'g'), '[^a-z0-9]+', '', 'g')
$$;
create or replace function public.insurers_no_duplicates() returns trigger language plpgsql as $$
declare other text;
begin
  if new.kind <> 'insurer' then return new; end if;
  select c.company_name into other from public.companies c
   where c.kind = 'insurer' and c.id <> new.id
     and (public.insurer_norm_name(c.company_name) = public.insurer_norm_name(new.company_name)
          or (new.domains is not null and c.domains && new.domains))
   limit 1;
  if other is not null then
    raise exception 'Insurer already on file as "%": merge instead of creating a second record', other using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists insurers_no_duplicates on public.companies;
create trigger insurers_no_duplicates before insert or update of company_name, domains, kind on public.companies
  for each row execute function public.insurers_no_duplicates();
