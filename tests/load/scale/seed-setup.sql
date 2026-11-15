-- Synthetic data for the scale test (docs/operations/capacity.md). LOCAL ONLY:
-- run against a throwaway database migrated to head, never production.
-- Step 1: vocabulary, paragraph pool and lookup tables used by seed-jobs.sql.
DROP SCHEMA IF EXISTS seed CASCADE;
CREATE SCHEMA seed;

CREATE TABLE seed.words AS
SELECT row_number() OVER () AS i, w FROM unnest(regexp_split_to_array(
 'the and to of a in for with our you we team will is are on as be work experience your
  this who an or that have product build engineering at by from customers about data role
  help us their it can new skills strong across more what all join remote company platform
  software systems design develop working ability about tools teams growth support value
  services quality ensure manage lead responsible requirements knowledge including such
  years using within best world people make other technical best-in-class collaborate
  python javascript typescript react node aws cloud kubernetes docker sql postgres api
  infrastructure security scale scalable backend frontend mobile machine learning model
  analytics customer success sales marketing operations finance benefits salary equity
  health insurance vacation flexible hours home office learning budget mission culture
  diverse inclusive equal opportunity employer applicants regard race gender identity
  responsibilities qualifications preferred required bachelor degree computer science
  communication written verbal english fluent problem solving ownership impact fast paced
  environment startup series funded investors leading global distributed asynchronous
  timezone overlap collaborate stakeholders roadmap features deliver ship code review
  testing automation pipeline deployment monitoring reliability performance improve
  architecture microservices database queries optimize mentor junior senior engineers
  hiring process interview stages offer onboarding first days months contribute shape
  industry partners clients projects solutions innovative cutting edge technology ai llm
  agents research publish open source community events conference travel occasional',
 '\s+')) AS w;
DELETE FROM seed.words WHERE w = '';

-- 6000 paragraphs of 50-150 Zipf-weighted words (~600 chars mean).
CREATE TABLE seed.paras AS
WITH v AS (SELECT array_agg(w ORDER BY i) AS a, count(*)::int AS n FROM seed.words)
SELECT p AS id,
       (SELECT string_agg(v.a[1 + floor(power(random(), 2.2) * v.n)::int + 0 * g], ' ')
          FROM generate_series(1, 50 + (random() * 100)::int + 0 * p) g) || '.' AS txt
FROM generate_series(1, 6000) p, v;
CREATE UNIQUE INDEX ON seed.paras (id);

CREATE TABLE seed.companies AS
SELECT c AS id,
       initcap((ARRAY['acme','nova','blue','orbit','zen','pixel','quantum','north','lumen','vector',
                      'atlas','delta','apex','echo','flux','kite','maple','nimbus','onyx','prism'])[1 + c % 20])
       || initcap((ARRAY['soft','works','ly','io','hub','base','stack','mind','forge','path'])[1 + (c / 20) % 10])
       || ' ' || (ARRAY['Labs','Inc.','GmbH','Ltd','Technologies','Group','AI','Systems','Health','Cloud'])[1 + (c / 200) % 10]
       || CASE WHEN c > 2000 THEN ' ' || c ELSE '' END AS name
FROM generate_series(1, 200000) c;
CREATE UNIQUE INDEX ON seed.companies (id);

CREATE TABLE seed.titles AS
SELECT row_number() OVER () AS id, s || r AS t FROM
 unnest(ARRAY['', 'Senior ', 'Staff ', 'Junior ', 'Lead ', 'Principal ', 'Head of ']) s,
 unnest(ARRAY['Software Engineer','Backend Engineer','Frontend Engineer','Full Stack Developer',
   'Data Scientist','Data Engineer','ML Engineer','DevOps Engineer','Site Reliability Engineer',
   'Product Manager','Product Designer','UX Researcher','Customer Success Manager',
   'Account Executive','Marketing Manager','Content Writer','Technical Writer','QA Engineer',
   'Security Engineer','Mobile Engineer (iOS)','Android Developer','Solutions Architect',
   'Support Specialist','Recruiter','Financial Analyst','Operations Manager','AI Engineer',
   'Platform Engineer','Engineering Manager','Sales Development Representative']) r;
CREATE UNIQUE INDEX ON seed.titles (id);

CREATE TABLE seed.skills AS
SELECT row_number() OVER () AS id, trim(s) AS s FROM unnest(string_to_array(
 'Python,JavaScript,TypeScript,React,Node.js,AWS,GCP,Azure,Kubernetes,Docker,SQL,PostgreSQL,
  MySQL,MongoDB,Redis,Go,Rust,Java,Kotlin,Swift,C++,C#,.NET,Ruby,Rails,PHP,Laravel,Django,
  FastAPI,Flask,Spring,Vue,Angular,Next.js,GraphQL,REST,Terraform,Ansible,Linux,CI/CD,
  Machine Learning,Deep Learning,PyTorch,TensorFlow,NLP,LLM,Data Analysis,Pandas,Spark,Kafka,
  Airflow,dbt,Snowflake,Tableau,Figma,Sketch,UX,UI,Product Management,Agile,Scrum,Jira,
  SEO,Content Marketing,Salesforce,HubSpot,Excel,Communication,Leadership,Customer Service,
  Sales,Copywriting,Security,Penetration Testing,iOS,Android,Flutter,React Native,Elixir,
  Scala,Haskell,Clojure,Solidity,Blockchain,Embedded,FPGA,Unity,Unreal,Selenium,Cypress,
  Playwright,Jest,Testing,QA,Accounting,Finance,Legal,HR,Recruiting,Operations,Writing',
 ',')) AS s;
CREATE UNIQUE INDEX ON seed.skills (id);
