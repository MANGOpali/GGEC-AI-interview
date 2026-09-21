-- Optional: enable pg_cron in Supabase Dashboard > Database > Extensions first.
-- Execute once as database owner. Change 90 to your approved retention policy.
select cron.schedule('ggec-transcript-retention','15 2 * * *', $$select public.purge_transcripts(90);$$);
-- Review holds are excluded. Review holds regularly; clear them when no longer needed.
