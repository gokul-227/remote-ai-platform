-- Member hot paths at 1M members (EXPLAIN ANALYZE timings). psql -f bench-members.sql
\timing on
SELECT id AS uid FROM users WHERE email = 'member424242@example.com' \gset
-- sign-in: identity lookup + user by subject/email
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT * FROM user_identities WHERE provider = 'workos' AND subject = 'user_' || md5('424242');
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT * FROM users WHERE lower(email) = 'member424242@example.com';
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT * FROM users WHERE email = 'member424242@example.com';
-- feed: connections, then posts by those authors newest first
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT * FROM connections WHERE (sender_id = :'uid' OR receiver_id = :'uid') AND status = 'ACCEPTED';
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF)
SELECT p.* FROM posts p WHERE p.author_id IN (SELECT CASE WHEN sender_id = :'uid' THEN receiver_id ELSE sender_id END FROM connections WHERE (sender_id = :'uid' OR receiver_id = :'uid') AND status = 'ACCEPTED' UNION SELECT :'uid'::uuid)
ORDER BY p.created_at DESC, p.id DESC LIMIT 20;
-- public post feed
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT * FROM posts WHERE visibility = 'PUBLIC' ORDER BY created_at DESC, id DESC LIMIT 20;
-- notifications list + unread count
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT * FROM notifications WHERE user_id = :'uid' ORDER BY created_at DESC LIMIT 50;
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT count(id) FROM notifications WHERE user_id = :'uid' AND NOT is_read;
-- messages: conversations, latest message, unread count
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF) SELECT * FROM conversations WHERE participant_one_id = :'uid' OR participant_two_id = :'uid' ORDER BY updated_at DESC LIMIT 50;
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF)
SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id
WHERE (c.participant_one_id = :'uid' OR c.participant_two_id = :'uid') AND m.sender_id <> :'uid' AND NOT m.is_read;
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF)
SELECT * FROM messages WHERE conversation_id = (SELECT id FROM conversations WHERE participant_one_id = :'uid' OR participant_two_id = :'uid' LIMIT 1) ORDER BY created_at DESC LIMIT 50;
-- people search (as engineers/repository.py builds it)
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF)
SELECT * FROM engineer_profiles WHERE is_public AND (lower(headline) LIKE '%rust%' OR lower(bio) LIKE '%rust%' OR lower(primary_role) LIKE '%rust%' OR CAST(skills AS text) ILIKE '%rust%')
ORDER BY updated_at DESC, id DESC LIMIT 20;
EXPLAIN (ANALYZE, BUFFERS, SUMMARY ON, COSTS OFF)
SELECT * FROM engineer_profiles WHERE is_public AND lower(primary_role) LIKE '%data engineer%' ORDER BY updated_at DESC, id DESC LIMIT 20;
-- notification fan-out: one in-app row each for 10,000 members (rolled back)
BEGIN;
EXPLAIN (ANALYZE, SUMMARY ON, COSTS OFF)
INSERT INTO notifications (id, user_id, title, body, kind) SELECT gen_random_uuid(), id, 'Announcement', 'Body', 'system' FROM users LIMIT 10000;
ROLLBACK;
-- sign-up: one user + identity + profile (rolled back)
BEGIN;
EXPLAIN (ANALYZE, SUMMARY ON, COSTS OFF) INSERT INTO users (id, auth_subject, email, full_name, role) VALUES (gen_random_uuid(), 'new-sub-1', 'new1@example.com', 'New', 'ENGINEER');
ROLLBACK;
