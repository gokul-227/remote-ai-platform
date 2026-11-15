-- Step 4: rebuild the job_posts indexes dropped before the bulk load, timing each.
SET maintenance_work_mem = '1GB';
DO $$
DECLARE r record; t timestamptz;
BEGIN
  FOR r IN SELECT indexname, indexdef FROM seed.jobidx ORDER BY indexname LOOP
    t := clock_timestamp();
    EXECUTE replace(r.indexdef, 'CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ');
    RAISE NOTICE '% built in % s', r.indexname, round(extract(epoch FROM clock_timestamp() - t)::numeric, 1);
  END LOOP;
END $$;
