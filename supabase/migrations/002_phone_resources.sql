-- Run once after 001_initial.sql in the Supabase SQL Editor (or psql).
-- Adds the required student phone number and admin-editable student resources.
alter table public.users add column if not exists phone text not null default '';
-- Signup always creates a Student; phone is captured from signup metadata.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.users(id,email,name,phone) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name',''),coalesce(new.raw_user_meta_data->>'phone','')); return new; end $$;
create table if not exists public.resources(id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('template','research')), title text not null, body text not null default '', position integer not null default 0, active boolean not null default true, updated_at timestamptz not null default now());
create index if not exists resources_kind on public.resources(kind,position);
alter table public.resources enable row level security;
-- Same model as every other table: no browser grants, the API owns reads/writes.
revoke all on public.resources from anon,authenticated;
grant all on public.resources to service_role;
insert into public.resources(id,kind,title,body,position,active) values
('40000000-0000-4000-8000-000000000001','template','STAR answer template','Use four short moves for almost any interview question.

Situation - set the scene in one sentence.
Task - say what you had to decide or do.
Action - describe what you actually did, in your own words.
Result - give the outcome and what you learned.

Keep it personal. Interviewers trust specific detail far more than a polished sentence.',1,true),
('40000000-0000-4000-8000-000000000002','template','Finance and funding template','Answer money questions with a clear, honest structure.

Sponsor - who is paying, and your relationship to them.
Income and savings - what funds are actually available and accessible.
Tuition - the exact fee for your course and intake.
Living costs - a realistic monthly budget for rent, food, travel and books.
Evidence - the bank statements or sponsor letters you can show.

Never guess a number. If a figure changes, update it before your interview.',2,true),
('40000000-0000-4000-8000-000000000003','template','University research template','Build a specific, checkable reason for choosing this university.

Course and modules - name modules you actually want to study.
Facilities and staff - research groups, labs or support that fit your goals.
Comparison - one or two alternatives you considered and why this one won.
Course facts - duration, fees, intake and entry requirements from the official page.

Quote the source in your own words rather than reading a page aloud.',3,true),
('40000000-0000-4000-8000-000000000004','research','How to research a university','Start at the official university website, not an agency or forum.

1. Open the official course page and confirm the course title, duration and intake.
2. Read the module list for your specific intake and note two modules that interest you.
3. Check the department page for staff, research areas and facilities.
4. Record the exact page you used and the date you checked it.

Treat rankings and reviews as background only. Base your answer on facts you verified yourself.',1,true),
('40000000-0000-4000-8000-000000000005','research','Verify course modules and fees','Course details change between intakes, so verify before every interview.

- Use the official course page for the correct intake year.
- Confirm the exact tuition fee and any deposit or scholarship conditions.
- List the compulsory modules, then any optional modules you plan to take.
- Note the English language and academic entry requirements.

If a detail is not published, say so and explain how you will confirm it.

',2,true),
('40000000-0000-4000-8000-000000000006','research','Funding and living costs research','Prepare a budget you can defend with evidence.

1. Total your tuition for the full course, not one year.
2. Estimate living costs for the actual city using the university cost-of-living guidance.
3. List each funding source: savings, family support, sponsor, scholarship or loan.
4. Keep documents ready: bank statements, sponsor letter, scholarship offer.

Your answers should match the figures on your documents exactly.',3,true)
on conflict (id) do nothing;
