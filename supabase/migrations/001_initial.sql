-- Run once in a fresh Supabase project. Backend owns all writes and audited reads.
-- gen_random_uuid() is built into PostgreSQL 13+; no extra extension needed.
create table public.users(id uuid primary key references auth.users(id) on delete cascade, role text not null default 'student' check(role in ('student','counsellor','admin')), name text not null default '', email text);
create table public.assignments(id uuid primary key default gen_random_uuid(), counsellor_id uuid not null references public.users(id) on delete cascade, student_id uuid not null references public.users(id) on delete cascade, unique(counsellor_id,student_id));
create table public.student_profiles(id uuid primary key references public.users(id) on delete cascade, private_data jsonb not null, leaderboard_opt_in boolean not null default false, leaderboard_alias text not null default '');
create table public.questions(id uuid primary key default gen_random_uuid(), category text not null, text text not null, expected_concepts text not null default '', verified_context text not null default '', source_url text not null default '', weight numeric not null default 1 check(weight>0 and weight<=10), is_main_question boolean not null default true, active boolean not null default true);
create table public.interview_sessions(id uuid primary key, student_id uuid not null references public.users(id) on delete cascade, version integer not null default 0, data jsonb not null, profile_snapshot jsonb not null, report_summary jsonb);
create table public.interview_answers(id uuid primary key, session_id uuid not null references public.interview_sessions(id) on delete cascade, sequence integer not null, data jsonb not null, unique(session_id,sequence));
create table public.reports(id uuid primary key default gen_random_uuid(), session_id uuid unique not null references public.interview_sessions(id) on delete cascade, report_json jsonb not null);
create table public.access_logs(id uuid primary key default gen_random_uuid(), actor_id uuid references public.users(id) on delete set null, student_id uuid references public.users(id) on delete set null, resource text not null, created_at timestamptz not null default now());
create index sessions_student on public.interview_sessions(student_id);
create index answers_session on public.interview_answers(session_id);
create index logs_student on public.access_logs(student_id,created_at);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.users(id,email,name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name','')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Never trust role supplied in signup metadata. Provision staff via trusted SQL only.
create function public.can_read_student(target uuid) returns boolean language sql stable security definer set search_path=public as $$ select auth.uid()=target or exists(select 1 from public.users where id=auth.uid() and role='admin') or exists(select 1 from public.assignments a join public.users u on u.id=a.counsellor_id where u.id=auth.uid() and u.role='counsellor' and a.student_id=target) $$;
alter table public.users enable row level security;
alter table public.assignments enable row level security;
alter table public.student_profiles enable row level security;
alter table public.questions enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_answers enable row level security;
alter table public.reports enable row level security;
alter table public.access_logs enable row level security;
create policy users_read on public.users for select to authenticated using(public.can_read_student(id));
create policy assignments_read on public.assignments for select to authenticated using(counsellor_id=auth.uid() or student_id=auth.uid() or exists(select 1 from public.users where id=auth.uid() and role='admin'));
create policy profiles_read on public.student_profiles for select to authenticated using(public.can_read_student(id));
create policy sessions_read on public.interview_sessions for select to authenticated using(public.can_read_student(student_id));
create policy answers_read on public.interview_answers for select to authenticated using(exists(select 1 from public.interview_sessions s where s.id=session_id and public.can_read_student(s.student_id)));
create policy reports_read on public.reports for select to authenticated using(exists(select 1 from public.interview_sessions s where s.id=session_id and public.can_read_student(s.student_id)));
-- Deliberately no browser table grants: staff access MUST pass the API for audit logs;
-- student reads MUST pass response redaction (internal evaluator notes are private).
-- RLS remains defense-in-depth. The API verifies JWT and assignments before elevated calls.
revoke all on public.users,public.assignments,public.student_profiles,public.questions,public.interview_sessions,public.interview_answers,public.reports,public.access_logs from anon,authenticated;
grant all on public.users,public.assignments,public.student_profiles,public.questions,public.interview_sessions,public.interview_answers,public.reports,public.access_logs to service_role;
create function public.save_interview(p_id uuid,p_student uuid,p_expected integer,p_data jsonb,p_profile jsonb,p_answers jsonb,p_report jsonb) returns void language plpgsql security definer set search_path=public as $$
declare current_version integer; answer jsonb; seq integer:=0;
begin
 if p_expected=-1 then
  insert into public.interview_sessions(id,student_id,version,data,profile_snapshot) values(p_id,p_student,0,p_data,p_profile) on conflict do nothing;
  if not found then raise exception 'version conflict'; end if;
 else
  select version into current_version from public.interview_sessions where id=p_id and student_id=p_student for update;
  if current_version is null or current_version<>p_expected then raise exception 'version conflict'; end if;
  update public.interview_sessions set version=p_expected+1,data=p_data,profile_snapshot=p_profile where id=p_id;
 end if;
 for answer in select value from jsonb_array_elements(p_answers) loop
  insert into public.interview_answers(id,session_id,sequence,data) values((answer->>'id')::uuid,p_id,seq,answer) on conflict(id) do update set data=excluded.data;
  seq:=seq+1;
 end loop;
 if p_report is not null and p_report<>'null'::jsonb then
  insert into public.reports(session_id,report_json) values(p_id,p_report) on conflict(session_id) do update set report_json=excluded.report_json;
  update public.interview_sessions set report_summary=jsonb_build_object('overall_score',p_report->'overall_score','readiness_level',p_report->'readiness_level') where id=p_id;
 end if;
end $$;
revoke all on function public.save_interview(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_interview(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb) to service_role;
create function public.purge_transcripts(retention_days integer default 90) returns integer language plpgsql security definer set search_path=public as $$
declare affected integer:=0; n integer; s record;
begin
 if retention_days<1 then raise exception 'Invalid retention period'; end if;
 for s in select * from public.interview_sessions where (data->>'started_at')::timestamptz<now()-make_interval(days=>retention_days) and coalesce((data->>'review_hold')::boolean,false)=false and not(data ? 'retained_at') for update loop
  update public.interview_answers set data=jsonb_set(jsonb_set(data,'{transcript}','null'),'{evaluation}','null') where session_id=s.id and data->'transcript'<>'null'::jsonb;
  get diagnostics n=row_count;affected:=affected+n;
  update public.reports set report_json=report_json||'{"recommendations":[],"contradictions":[],"missing_information":[]}'::jsonb where session_id=s.id;
  -- Snapshot replaced by encrypted empty object via normal app save is not available in SQL;
  -- remove encrypted profile and mark purged; repository recognizes this sentinel.
  update public.interview_sessions set profile_snapshot='{"purged":true}',version=version+1,data=data||jsonb_build_object('retained_at',now(),'state',case when data->>'state'='REPORT' then 'REPORT' else 'EXPIRED' end,'pending_follow_up',null) where id=s.id;
 end loop;return affected;
end $$;
revoke all on function public.purge_transcripts(integer) from public,anon,authenticated;
grant execute on function public.purge_transcripts(integer) to service_role;
