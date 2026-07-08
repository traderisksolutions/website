-- Enable Supabase Realtime on chat_messages so message inserts/updates propagate
-- (cross-tab sync + a safety net for the streamed assistant reply). RLS still
-- applies to realtime, so users only receive their own rows. Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
end $$;
