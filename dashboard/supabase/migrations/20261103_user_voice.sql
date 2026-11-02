-- Voice profile per sender (3 Nov 2026). Apply with ~/trs-dn-migration/apply-sql.sh. Safe to re-run.
-- How a person greets and signs: {"greetingFirst":"Dear","greetingWarm":"Hi","thanks":true,
-- "closing":"Warmest Regards,","phoneOnFirstContact":true,"company":false}. Name and phone stay on
-- their own columns. Read by src/lib/admin/b/voice.ts at approval and auto-send.
alter table public.user_signatures add column if not exists voice jsonb;
notify pgrst, 'reload schema';
