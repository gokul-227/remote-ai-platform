-- Step 3: :users members with identities and profiles, and the social graph around
-- them (5 connections, 2 posts, 20 notifications, 1 conversation of 10 messages,
-- 2 saved jobs and 1 application per member on average). Run after seed-jobs.sql.
\set ON_ERROR_STOP 1
SET synchronous_commit = off;

CREATE TABLE seed.uids AS
SELECT n, gen_random_uuid() AS id FROM generate_series(1, :users) n;
CREATE UNIQUE INDEX ON seed.uids (n);

INSERT INTO users (id, auth_subject, email, full_name, role, is_active, created_at, updated_at)
SELECT id, 'user_' || md5(n::text), 'member' || n || '@example.com',
       initcap(substr(md5(n::text), 1, 6)) || ' ' || initcap(substr(md5(n::text), 7, 8)),
       CASE WHEN n % 50 = 0 THEN 'COMPANY'::user_role_enum ELSE 'ENGINEER'::user_role_enum END,
       true, now() - (n % 700) * interval '1 day', now() - (n % 30) * interval '1 day'
FROM seed.uids;

INSERT INTO user_identities (id, user_id, provider, subject, email, created_at, last_seen_at)
SELECT gen_random_uuid(), id, 'workos', 'user_' || md5(n::text), 'member' || n || '@example.com', now(), now()
FROM seed.uids;

INSERT INTO engineer_profiles (id, user_id, headline, bio, location, years_of_experience, primary_role,
  skills, experience, projects, education, matching_keywords, is_public, is_open_to_work,
  country, timezone, languages, certifications, previous_companies, missing_skills, created_at, updated_at)
SELECT gen_random_uuid(), u.id, t.t || ' at ' || c.name, p.txt,
  (ARRAY['Berlin','London','Remote','New York','Bangalore','Toronto','Lisbon','Austin'])[1 + n % 8],
  n % 25, t.t,
  (SELECT jsonb_agg(DISTINCT sk.a[1 + floor(power(random(), 2) * 99)::int + 0 * g]) FROM generate_series(0, 4 + n % 8) g),
  jsonb_build_array(jsonb_build_object('company', c.name, 'title', t.t, 'start', '2021-01', 'description', left(p.txt, 300)),
                    jsonb_build_object('company', 'Prior Co ' || n % 1000, 'title', t.t, 'start', '2018-03', 'end', '2020-12')),
  '[]'::jsonb, jsonb_build_array(jsonb_build_object('school', 'University ' || n % 500, 'degree', 'BSc')),
  '[]'::jsonb, n % 10 <> 0, n % 3 = 0,
  (ARRAY['DE','GB','US','US','IN','CA','PT','US'])[1 + n % 8], 'UTC', '["English"]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), now() - (n % 400) * interval '1 day'
FROM seed.uids u
CROSS JOIN (SELECT array_agg(s ORDER BY id) AS a FROM seed.skills) sk
JOIN seed.titles t ON t.id = 1 + (n * 7 % 210)
JOIN seed.companies c ON c.id = 1 + (n * 13 % 200000)
JOIN seed.paras p ON p.id = 1 + (n % 6000);

INSERT INTO connections (id, sender_id, receiver_id, status, created_at, updated_at)
SELECT gen_random_uuid(), a.id, b.id, CASE WHEN k < 4 THEN 'ACCEPTED' ELSE 'PENDING' END, now(), now()
FROM seed.uids a, generate_series(0, 4) k
JOIN seed.uids b ON true
WHERE b.n = 1 + ((a.n * 31 + k * 7919 + 1) % :users) AND b.n <> a.n
ON CONFLICT DO NOTHING;

INSERT INTO posts (id, author_id, content, visibility, like_count, comment_count, created_at, updated_at)
SELECT gen_random_uuid(), u.id, left(p.txt, 80 + (u.n * k) % 500), 'PUBLIC', (u.n * k) % 40, (u.n + k) % 6,
       now() - ((u.n * 3 + k) % 365) * interval '1 day', now()
FROM seed.uids u, generate_series(1, 2) k, seed.paras p WHERE p.id = 1 + ((u.n + k) % 6000);

-- In four statements of five per member: one 20M-row INSERT needs more memory
-- than a 6 GB test container has.
INSERT INTO notifications (id, user_id, title, body, kind, is_read, created_at)
SELECT gen_random_uuid(), u.id, 'New job matches your search',
       '3 new jobs match "' || left(p.txt, 40) || '"', (ARRAY['job','system','message','network'])[1 + k % 4],
       k > 3, now() - k * interval '1 day'
FROM seed.uids u, generate_series(1, 5) k, seed.paras p WHERE p.id = 1 + ((u.n + k) % 6000);

INSERT INTO notifications (id, user_id, title, body, kind, is_read, created_at)
SELECT gen_random_uuid(), u.id, 'New job matches your search',
       '3 new jobs match "' || left(p.txt, 40) || '"', (ARRAY['job','system','message','network'])[1 + k % 4],
       k > 3, now() - k * interval '1 day'
FROM seed.uids u, generate_series(6, 10) k, seed.paras p WHERE p.id = 1 + ((u.n + k) % 6000);

INSERT INTO notifications (id, user_id, title, body, kind, is_read, created_at)
SELECT gen_random_uuid(), u.id, 'New job matches your search',
       '3 new jobs match "' || left(p.txt, 40) || '"', (ARRAY['job','system','message','network'])[1 + k % 4],
       k > 3, now() - k * interval '1 day'
FROM seed.uids u, generate_series(11, 15) k, seed.paras p WHERE p.id = 1 + ((u.n + k) % 6000);

INSERT INTO notifications (id, user_id, title, body, kind, is_read, created_at)
SELECT gen_random_uuid(), u.id, 'New job matches your search',
       '3 new jobs match "' || left(p.txt, 40) || '"', (ARRAY['job','system','message','network'])[1 + k % 4],
       k > 3, now() - k * interval '1 day'
FROM seed.uids u, generate_series(16, 20) k, seed.paras p WHERE p.id = 1 + ((u.n + k) % 6000);

CREATE TABLE seed.convs AS
SELECT gen_random_uuid() AS id, a.id AS p1, b.id AS p2
FROM seed.uids a JOIN seed.uids b ON b.n = 1 + (a.n % :users) WHERE a.n < b.n OR b.n = 1;
INSERT INTO conversations (id, participant_one_id, participant_two_id, created_at, updated_at)
SELECT id, least(p1, p2), greatest(p1, p2), now(), now() FROM seed.convs ON CONFLICT DO NOTHING;
INSERT INTO messages (id, conversation_id, sender_id, content, is_read, created_at, attachment_ids)
SELECT gen_random_uuid(), c.id, CASE WHEN k % 2 = 0 THEN c.p1 ELSE c.p2 END, 'Hi! Message ' || k || ' about the role.',
       k < 9, now() - (10 - k) * interval '1 hour', '[]'::jsonb
FROM seed.convs c JOIN conversations cc ON cc.id = c.id, generate_series(1, 10) k;

CREATE TABLE seed.jobsample AS SELECT id FROM job_posts TABLESAMPLE SYSTEM (5) LIMIT 1000000;
CREATE TABLE seed.js AS SELECT row_number() OVER () AS n, id FROM seed.jobsample;
CREATE UNIQUE INDEX ON seed.js (n);
INSERT INTO saved_jobs (id, user_id, job_id, created_at)
SELECT gen_random_uuid(), u.id, j.id, now() FROM seed.uids u, generate_series(0, 1) k
JOIN seed.js j ON true WHERE j.n = 1 + ((u.n * 2 + k) % (SELECT count(*) FROM seed.js))
ON CONFLICT DO NOTHING;
INSERT INTO job_applications (id, user_id, job_id, status, created_at, updated_at)
SELECT gen_random_uuid(), u.id, j.id, 'submitted', now(), now() FROM seed.uids u
JOIN seed.js j ON j.n = 1 + ((u.n * 7 + 3) % (SELECT count(*) FROM seed.js))
ON CONFLICT DO NOTHING;
