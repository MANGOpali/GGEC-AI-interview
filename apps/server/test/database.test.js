import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('Postgres migration, signup roles, RPC transactions, table grants, RLS and retention', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL('../../../supabase/migrations/001_initial.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.exec(
      await readFile(
        new URL('../../../supabase/migrations/002_phone_resources.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.exec(
      await readFile(
        new URL('../../../supabase/migrations/003_question_timers.sql', import.meta.url),
        'utf8',
      ),
    );
    const student = '10000000-0000-4000-8000-000000000001',
      other = '10000000-0000-4000-8000-000000000002',
      counsellor = '10000000-0000-4000-8000-000000000003',
      session = '20000000-0000-4000-8000-000000000001',
      answer = '30000000-0000-4000-8000-000000000001';
    await db.query(
      `insert into auth.users(id,email,raw_user_meta_data) values($1,'student@example.test','{"role":"admin"}'),($2,'other@example.test','{}'),($3,'counsellor@example.test','{}')`,
      [student, other, counsellor],
    );
    assert.equal(
      (await db.query('select role from public.users where id=$1', [student])).rows[0].role,
      'student',
    );
    assert.equal(
      (await db.query('select phone from public.users where id=$1', [student])).rows[0].phone,
      '',
    );
    assert.equal(
      (await db.query(`select count(*)::int as n from public.resources`)).rows[0].n,
      6,
    );
    assert.equal(
      (
        await db.query(
          `select column_name from information_schema.columns where table_schema='public' and table_name='questions' and column_name='time_limit_seconds'`,
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          `select has_table_privilege('authenticated','public.resources','select') as read`,
        )
      ).rows[0].read,
      false,
    );
    await db.query(`update public.users set role='counsellor' where id=$1`, [counsellor]);
    await db.query('insert into public.assignments(counsellor_id,student_id) values($1,$2)', [
      counsellor,
      student,
    ]);
    const payload = {
      state: 'MAIN_QUESTION',
      started_at: '2020-01-01T00:00:00Z',
      review_hold: false,
      evaluation_job: { state: 'queued', provider: 'fixture' },
    };
    await db.query('select public.save_interview($1,$2,-1,$3,$4,$5,null)', [
      session,
      student,
      JSON.stringify(payload),
      '{}',
      JSON.stringify([
        { id: answer, transcript: 'Sensitive transcript', evaluation: { reasoning: 'Private' } },
      ]),
    ]);
    assert.equal(
      (await db.query('select data from public.interview_sessions where id=$1', [session])).rows[0]
        .data.evaluation_job.state,
      'queued',
    );
    await assert.rejects(
      db.query('select public.save_interview($1,$2,99,$3,$4,$5,null)', [
        session,
        student,
        JSON.stringify(payload),
        '{}',
        '[]',
      ]),
      /version conflict/,
    );
    assert.equal(
      (await db.query('select version from public.interview_sessions')).rows[0].version,
      0,
    );
    const permissions = await db.query(
      `select has_table_privilege('authenticated','public.interview_answers','select') as read,has_function_privilege('authenticated','public.save_interview(uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb)','execute') as write`,
    );
    assert.equal(permissions.rows[0].read, false);
    assert.equal(permissions.rows[0].write, false);
    // Temporarily allow SELECT only inside this isolated test to exercise latent RLS policies.
    await db.exec(
      'grant select on public.users,public.assignments,public.interview_sessions,public.interview_answers to authenticated',
    );
    await db.exec('set role authenticated');
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [other]);
    assert.equal((await db.query('select * from public.interview_answers')).rows.length, 0);
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [student]);
    assert.equal((await db.query('select * from public.interview_answers')).rows.length, 1);
    await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [counsellor]);
    assert.equal((await db.query('select * from public.interview_answers')).rows.length, 1);
    await db.exec('reset role');
    const result = await db.query('select public.purge_transcripts(90) as count');
    assert.equal(result.rows[0].count, 1);
    assert.equal(
      (await db.query('select data from public.interview_answers')).rows[0].data.transcript,
      null,
    );
    assert.equal(
      (await db.query('select data from public.interview_sessions')).rows[0].data.state,
      'EXPIRED',
    );
    assert.equal((await db.query('select public.purge_transcripts(90) as count')).rows[0].count, 0);
  } finally {
    await db.close();
  }
});
