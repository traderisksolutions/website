-- Employment Benefits: ages each scheme covers (renewal maximum; new-business limits sit on the
-- renewal-only rate rows). Sources: RCC application v3 C502; Singlife brochure Jun 2022; AIA
-- brochure May 2025 p5, p17; QBE brochure V12. Income already carries its own (Working!C4).
begin;
update gb_rate_tables set rules = coalesce(rules, '{}'::jsonb) || '{"eligibility":{"adult_min_age":16,"adult_max_age":75,"child_max_age":25}}'::jsonb where insurer_name ilike 'Raffles%';
update gb_rate_tables set rules = coalesce(rules, '{}'::jsonb) || '{"eligibility":{"adult_min_age":16,"adult_max_age":75}}'::jsonb where insurer_name ilike 'Singapore Life%';
update gb_rate_tables set rules = coalesce(rules, '{}'::jsonb) || '{"eligibility":{"adult_min_age":16,"adult_max_age":74,"child_max_age":25},"product_eligibility":[{"product":"DENTAL","child_min_age":3,"child_max_age":25}]}'::jsonb where insurer_name ilike 'AIA%';
update gb_rate_tables set rules = coalesce(rules, '{}'::jsonb) || '{"eligibility":{"adult_max_age":85}}'::jsonb where insurer_name ilike 'QBE%';
select insurer_name, rules->'eligibility' as eligibility, rules->'product_eligibility' as product_eligibility from gb_rate_tables order by insurer_name;
commit;
