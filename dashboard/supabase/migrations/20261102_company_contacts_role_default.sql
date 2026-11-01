-- company_contacts.role had no default, so acts-for links written by the cleanup and the resolver
-- (which set scope, not role) failed the not-null check. Apply with ~/trs-dn-migration/apply-sql.sh.
alter table public.company_contacts alter column role set default 'contact';
notify pgrst, 'reload schema';
