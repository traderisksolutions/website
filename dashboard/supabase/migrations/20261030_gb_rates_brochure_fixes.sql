-- Employment Benefits rate fixes from the 29–30 Oct 2026 audit (every live rate compared at every
-- age with TRS EB Calculator V1.2, which matches the insurers' brochures and calculators cell for cell).
begin;

-- 1. QBE Steadfast MCare+: plans the brochure (V12, p13) says are not sold.
--    Plan 5 is government 4-bed only; the 20% co-insurance option is for private hospital plans only.
with qbe as (select id from gb_rate_tables where insurer_name ilike 'QBE%')
delete from gb_rates r using qbe
 where r.rate_table_id = qbe.id
   and (r.plan_code ilike 'Plan 5 · Government 1-bedded%' or (r.plan_code ilike '%Government%' and r.plan_code ilike '%20%% co-insurance%'));
with qbe as (select id from gb_rate_tables where insurer_name ilike 'QBE%')
delete from gb_plans p using qbe
 where p.rate_table_id = qbe.id
   and (p.plan_code ilike 'Plan 5 · Government 1-bedded%' or (p.plan_code ilike '%Government%' and p.plan_code ilike '%20%% co-insurance%'));

-- 2. AIA Flexi Vital Care Plus: new entrants to age 69, renewal to 74 (brochure p5); critical
--    illness new entrants to 64, renewal to 69, so GTL + GACI at 65–69 is renewal only.
with aia as (select id from gb_rate_tables where insurer_name ilike 'AIA%')
update gb_rates r set renewal_only = true from aia
 where r.rate_table_id = aia.id and r.age_min >= 70;
with aia as (select id from gb_rate_tables where insurer_name ilike 'AIA%')
update gb_rates r set renewal_only = true from aia
 where r.rate_table_id = aia.id and r.product_code = 'GTL + GACI' and r.age_min >= 65;

-- 3. AIA plan rows sat under product 'GHS' while its rates are 'GHS+EMM'.
with aia as (select id from gb_rate_tables where insurer_name ilike 'AIA%')
update gb_plans p set product_code = 'GHS+EMM' from aia where p.rate_table_id = aia.id and p.product_code = 'GHS';

-- 4. Income FlexCare hospital plans: hospital and ward (2026 brochure p6).
with inc as (select id from gb_rate_tables where insurer_name ilike 'Income%')
update gb_plans p set
  hospital_type = v.hospital_type, beds = v.beds, plan_name = v.plan_name
  from inc, (values
    ('Plan 1', 'PRIVATE', '1 Bed', 'Plan 1 · Private 1-bed · S$200,000 a year'),
    ('Plan 2', 'PRIVATE', '1 Bed', 'Plan 2 · Private 1-bed · as charged'),
    ('Plan 3', 'RESTRUCTURED', '1 Bed', 'Plan 3 · Restructured 1-bed'),
    ('Plan 4', 'PRIVATE', '4 Bed', 'Plan 4 · Private 4-bed'),
    ('Plan 5', 'RESTRUCTURED', '4 Bed', 'Plan 5 · Restructured 4-bed'),
    ('Plan 6', 'RESTRUCTURED', '4 Bed', 'Plan 6 · Work Permit / S Pass · 25% co-pay above S$15,000'),
    ('Plan 7', 'RESTRUCTURED', '4 Bed', 'Plan 7 · Work Permit / S Pass')
  ) as v(plan_code, hospital_type, beds, plan_name)
 where p.rate_table_id = inc.id and p.product_code ilike '%(GHS)%' and p.plan_code = v.plan_code;

-- 5. Every priced plan has a plan row, so pickers list what the engine can price.
insert into gb_plans (rate_table_id, product_code, plan_code)
select distinct r.rate_table_id, r.product_code, r.plan_code
  from gb_rates r
 where not exists (select 1 from gb_plans p where p.rate_table_id = r.rate_table_id and p.product_code = r.product_code and p.plan_code = r.plan_code);

select 'qbe invalid left' as check, count(*) from gb_rates r join gb_rate_tables t on t.id = r.rate_table_id
 where t.insurer_name ilike 'QBE%' and (r.plan_code ilike 'Plan 5 · Government 1-bedded%' or (r.plan_code ilike '%Government%' and r.plan_code ilike '%20%% co-insurance%'))
union all select 'aia renewal-only rows', count(*) from gb_rates r join gb_rate_tables t on t.id = r.rate_table_id where t.insurer_name ilike 'AIA%' and r.renewal_only
union all select 'plans total', count(*) from gb_plans;
commit;
