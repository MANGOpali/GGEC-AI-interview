-- Optional per-question answer time limit in seconds.
-- NULL means the app default applies: 120s for a main question, 60s for a follow-up.
alter table public.questions
  add column if not exists time_limit_seconds integer
  check (time_limit_seconds is null or (time_limit_seconds between 15 and 900));
