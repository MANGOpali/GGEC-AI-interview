-- Apply in Supabase SQL Editor after migrations 001-004.
-- Adds per-student credit balances, admin-defined packages, and purchase/usage audit logs for
-- the paid-interview-credit system. Existing students start at 0 interview credits (they will
-- need a package recorded by an admin before starting a full interview) and 10 free practice
-- questions, same as any new signup.
begin;

alter table public.users
  add column free_questions_remaining integer not null default 10,
  add column interview_question_credits_remaining integer not null default 0;

create table public.credit_packages(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_rs numeric not null check (price_rs >= 0),
  interview_credits integer not null check (interview_credits > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.credit_purchases(
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  package_id uuid references public.credit_packages(id) on delete set null,
  price_paid_rs numeric not null,
  question_credits_granted integer not null,
  recorded_by uuid references public.users(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.free_question_grants(
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  amount integer not null,
  recorded_by uuid references public.users(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Atomic, floor-at-zero adjustments -- avoids lost updates when several of a student's answers
-- are evaluated concurrently (the background evaluator can run up to 3 at once).
create or replace function public.adjust_free_questions(uid uuid, delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare new_val integer; begin
  update public.users set free_questions_remaining = greatest(0, free_questions_remaining + delta)
    where id = uid returning free_questions_remaining into new_val;
  return new_val;
end $$;

create or replace function public.adjust_interview_credits(uid uuid, delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare new_val integer; begin
  update public.users set interview_question_credits_remaining =
    greatest(0, interview_question_credits_remaining + delta)
    where id = uid returning interview_question_credits_remaining into new_val;
  return new_val;
end $$;

revoke all on function public.adjust_free_questions(uuid, integer) from public, anon, authenticated;
revoke all on function public.adjust_interview_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.adjust_free_questions(uuid, integer) to service_role;
grant execute on function public.adjust_interview_credits(uuid, integer) to service_role;

alter table public.credit_packages enable row level security;
alter table public.credit_purchases enable row level security;
alter table public.free_question_grants enable row level security;

revoke all on public.credit_packages, public.credit_purchases, public.free_question_grants
  from anon, authenticated;
grant all on public.credit_packages, public.credit_purchases, public.free_question_grants
  to service_role;

insert into public.credit_packages (name, price_rs, interview_credits)
values ('5 Mock Interviews', 500, 5);

commit;
