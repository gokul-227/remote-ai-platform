-- Step 2: one chunk of synthetic job_posts. psql -v lo=1 -v hi=1000000 -f seed-jobs.sql
-- Distributions: posted over the last 180 days (skewed recent), ~25% expired (older
-- rows more likely), 0.5% deleted, 0.5% hidden, descriptions 2-12 pooled paragraphs
-- (~4 KB mean, pglz-compressible like real postings), 3-8 skills, filter columns with
-- realistic NULL rates, 18 sources with a long tail, 200k employers (Zipf-ish).
\set ON_ERROR_STOP 1
SET synchronous_commit = off;
INSERT INTO job_posts (
  id, company_id, title, slug, description, company_name, company_logo, location, is_remote,
  job_type, experience_level, salary_min, salary_max, salary_period, currency, skills,
  external_id, external_url, source, dedup_key, workplace_type, seniority, country_code, region,
  tz_min, tz_max, industry, job_function, visa_sponsorship, language, derived_version,
  is_active, is_deleted, last_seen_at, expired_at, deleted_at, posted_at, created_at, updated_at)
SELECT
  gen_random_uuid(), NULL, t.t,
  lower(regexp_replace(t.t || '-' || c.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(n::text), 1, 6),
  (SELECT string_agg(p.txt, E'\n\n') FROM generate_series(0, r.k) g
     JOIN seed.paras p ON p.id = 1 + ((n * 31 + g * 977) % 6000)),
  c.name,
  CASE WHEN r.r1 < 0.6 THEN 'https://logo.example.com/' || md5(c.name) || '.png' END,
  (ARRAY['Remote','Remote - US','Remote - Europe','Berlin, Germany','London, UK','New York, NY',
         'Anywhere','Remote (EMEA)','Toronto, Canada','Bangalore, India','Remote - LATAM','Sydney, Australia'])[1 + (n % 12)],
  r.r2 < 0.8,
  (ARRAY['full-time','full-time','full-time','contract','part-time','freelance','internship','unspecified'])[1 + (n % 8)],
  NULL,
  CASE WHEN r.r3 < 0.35 THEN 40000 + (n % 120) * 1000 END,
  CASE WHEN r.r3 < 0.35 THEN 60000 + (n % 150) * 1000 END,
  CASE WHEN r.r3 < 0.35 THEN 'year' END,
  CASE WHEN n % 10 < 7 THEN 'USD' WHEN n % 10 < 9 THEN 'EUR' ELSE 'GBP' END,
  (SELECT jsonb_agg(DISTINCT sk.a[1 + floor(power(random(), 2) * 99)::int + 0 * g])
     FROM generate_series(0, 2 + (n % 6)) g),
  src.s || '-' || n,
  'https://jobs.example.com/' || lower(src.s) || '/' || n || '?utm_source=rap',
  src.s,
  md5(t.t || c.name || n),
  (ARRAY['remote','remote','remote','hybrid','onsite', NULL])[1 + (n % 6)],
  (ARRAY['junior','mid','senior','senior','lead', NULL, NULL])[1 + (n % 7)],
  (ARRAY['US','US','US','GB','DE','CA','IN','NL','FR','ES','BR','AU', NULL, NULL])[1 + (n % 14)],
  (ARRAY['north-america','europe','europe','asia-pacific','latam','worldwide', NULL])[1 + (n % 7)],
  CASE WHEN n % 3 = 0 THEN -8 + (n % 10) END, CASE WHEN n % 3 = 0 THEN -4 + (n % 10) END,
  (ARRAY['software','fintech','health','ecommerce','education','media','ai', NULL])[1 + (n % 8)],
  (ARRAY['engineering','engineering','data','design','product','sales','marketing','support', NULL])[1 + (n % 9)],
  CASE WHEN n % 11 = 0 THEN true WHEN n % 11 = 1 THEN false END,
  CASE WHEN n % 20 = 0 THEN 'de' ELSE 'en' END,
  1,
  r.r4 >= 0.005, r.r5 < 0.005,
  r.posted + interval '2 days',
  CASE WHEN r.r6 < r.age2 / 180.0 * 0.5 THEN r.posted + interval '30 days' END,
  NULL, r.posted, r.posted, r.posted
FROM generate_series(:lo::bigint, :hi::bigint) n
CROSS JOIN (SELECT array_agg(s ORDER BY id) AS a FROM seed.skills) sk
CROSS JOIN LATERAL (
  SELECT n AS nn, random() r1, random() r2, random() r3, random() r4, random() r5, random() r6,
         1 + floor(power(random(), 1.3) * 11)::int AS k,
         power(random(), 1.4) * 180 AS age,
         now() - power(random(), 1.4) * interval '180 days' AS posted
  WHERE n IS NOT NULL
) r0
CROSS JOIN LATERAL (SELECT r0.*, extract(epoch FROM now() - r0.posted) / 86400 AS age2) r
JOIN seed.titles t ON t.id = 1 + (n * 2654435761 % 210)
JOIN seed.companies c ON c.id = 1 + floor(power(((n * 40503) % 1000003) / 1000003.0, 3) * 199999)::int
JOIN LATERAL (SELECT (ARRAY['GREENHOUSE','GREENHOUSE','LEVER','LEVER','ASHBY','ADZUNA','ADZUNA','JOOBLE',
   'JOOBLE','REMOTIVE','REMOTEOK','HIMALAYAS','WORKABLE','SMARTRECRUITERS','ARBEITNOW','THEMUSE',
   'USAJOBS','JOBICY','WEWORKREMOTELY','DIRECT'])[1 + (n % 20)] AS s) src ON true;
