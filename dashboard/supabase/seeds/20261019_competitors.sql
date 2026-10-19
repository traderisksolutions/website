-- First competitor set for corpcover.com and benefixe.com (19 Oct 2026).
-- From web research the same day: every row's homepage resolved; blog_url is left for the
-- sweep to confirm except where the research saw the page. Remove rows on the Competitors
-- page, not here. Idempotent.

-- Corp Cover (b1000000-0000-4000-8000-000000000001): SME business insurance, Singapore.
insert into marketing_competitors (site_id, name, url, domain, blog_url, added_by) values
  ('b1000000-0000-4000-8000-000000000001', 'Anapi',                 'https://anapi.co',                    'anapi.co',               'https://anapi.co/blog/',                              'seed'),
  ('b1000000-0000-4000-8000-000000000001', 'Provide',               'https://provide.sg',                  'provide.sg',             null,                                                  'seed'),
  ('b1000000-0000-4000-8000-000000000001', 'SingSaver',             'https://www.singsaver.com.sg',        'singsaver.com.sg',       'https://www.singsaver.com.sg/blog',                   'seed'),
  ('b1000000-0000-4000-8000-000000000001', 'Liberty Insurance',     'https://libertyinsurance.com.sg',     'libertyinsurance.com.sg','https://libertyinsurance.com.sg/blog',                'seed'),
  ('b1000000-0000-4000-8000-000000000001', 'Howden Singapore',      'https://www.howdengroup.com/sg-en',   'howdengroup.com',        'https://www.howdengroup.com/sg-en/news-insights',     'seed'),
  ('b1000000-0000-4000-8000-000000000001', 'Chubb Singapore',       'https://www.chubb.com/sg-en',         'chubb.com',              'https://www.chubb.com/sg-en/articles/business/',      'seed')
on conflict (site_id, domain) do nothing;

-- Benefixe (b1000000-0000-4000-8000-000000000002): group employee benefits, Singapore.
insert into marketing_competitors (site_id, name, url, domain, blog_url, added_by) values
  ('b1000000-0000-4000-8000-000000000002', 'Mednefits',             'https://www.mednefits.com',           'mednefits.com',          'https://www.mednefits.com/blog/',                     'seed'),
  ('b1000000-0000-4000-8000-000000000002', 'Pacific Prime Singapore','https://www.pacificprime.sg',        'pacificprime.sg',        'https://www.pacificprime.sg/blog/',                   'seed'),
  ('b1000000-0000-4000-8000-000000000002', 'Howden Singapore',      'https://www.howdengroup.com/sg-en',   'howdengroup.com',        'https://www.howdengroup.com/sg-en/news-insights',     'seed'),
  ('b1000000-0000-4000-8000-000000000002', 'Marsh Singapore',       'https://www.marsh.com/sg',            'marsh.com',              'https://www.marsh.com/sg/en/services/employee-health-benefits/insights.html', 'seed'),
  ('b1000000-0000-4000-8000-000000000002', 'SingSaver',             'https://www.singsaver.com.sg',        'singsaver.com.sg',       'https://www.singsaver.com.sg/blog',                   'seed'),
  ('b1000000-0000-4000-8000-000000000002', 'Income Insurance',      'https://www.income.com.sg',           'income.com.sg',          'https://www.income.com.sg/blog',                      'seed'),
  ('b1000000-0000-4000-8000-000000000002', 'Singlife',              'https://www.singlife.com',            'singlife.com',           'https://www.singlife.com/en/blog',                    'seed')
on conflict (site_id, domain) do nothing;
