-- Apply in Supabase SQL Editor after migrations 001-003.
-- Atomic: existing duplicate numbers abort this migration without changing accounts.
begin;
create or replace function public.normalized_phone(value text)
returns text language sql immutable strict set search_path = public as $$
  select nullif(regexp_replace(value, '[^0-9]', '', 'g'), '');
$$;
-- Empty legacy numbers remain allowed. All non-empty numbers must be unique,
-- including direct writes and phone changes, not just browser signup.
create unique index users_phone_unique on public.users (public.normalized_phone(phone))
where public.normalized_phone(phone) is not null;
commit;
