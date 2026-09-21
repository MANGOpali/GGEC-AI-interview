import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { seedQuestions, seedResources } from './domain.js';
export const demoUsers = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Demo Student', role: 'student' },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Demo Counsellor', role: 'counsellor' },
  { id: '10000000-0000-4000-8000-000000000003', name: 'Demo Admin', role: 'admin' },
  { id: '10000000-0000-4000-8000-000000000004', name: 'Unassigned Student', role: 'student' },
];
export function conflict() {
  return Object.assign(
    new Error('This interview changed. Reload and continue from the saved answer.'),
    { status: 409 },
  );
}
export async function localRepository(path, vault) {
  let db;
  try {
    // Some Windows editors prepend a UTF-8 BOM; accept it without changing saved data.
    const contents = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '');
    try {
      db = JSON.parse(contents);
    } catch {
      throw new Error('Local demo storage is invalid JSON. Restore it from a backup.');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    db = {
      users: demoUsers,
      student_profiles: [],
      questions: seedQuestions,
      resources: seedResources,
      interview_sessions: [],
      access_logs: [],
      assignments: [
        { id: randomUUID(), counsellor_id: demoUsers[1].id, student_id: demoUsers[0].id },
      ],
    };
  }
  db.resources ??= seedResources;
  let queue = Promise.resolve();
  const write = (fn) => {
    const job = queue.then(async () => {
      const next = structuredClone(db),
        result = fn(next);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path + '.tmp', JSON.stringify(next, null, 2));
      await rename(path + '.tmp', path);
      db = next;
      return structuredClone(result ?? null);
    });
    queue = job.catch(() => {});
    return job;
  };
  const decode = (s) => ({
    ...structuredClone(s),
    profile_snapshot: vault.open(s.profile_snapshot),
  });
  return {
    kind: 'demo',
    async list(table) {
      await queue;
      return structuredClone(db[table] || []);
    },
    async get(table, id) {
      return (await this.list(table)).find((r) => r.id === id) || null;
    },
    async put(table, row) {
      return write((d) => {
        d[table] ??= [];
        const i = d[table].findIndex((x) => x.id === row.id);
        if (i < 0) d[table].push(row);
        else d[table][i] = row;
        return row;
      });
    },
    async remove(table, id) {
      return write((d) => {
        d[table] = (d[table] || []).filter((x) => x.id !== id);
      });
    },
    async profile(id) {
      const p = await this.get('student_profiles', id);
      return p
        ? {
            ...vault.open(p.private_data),
            leaderboard_opt_in: p.leaderboard_opt_in,
            leaderboard_alias: p.leaderboard_alias,
          }
        : null;
    },
    async saveProfile(id, p) {
      return this.put('student_profiles', {
        id,
        private_data: vault.seal(p),
        leaderboard_opt_in: p.leaderboard_opt_in,
        leaderboard_alias: p.leaderboard_alias,
      });
    },
    async sessions() {
      return (await this.list('interview_sessions')).map(decode);
    },
    async session(id) {
      const s = await this.get('interview_sessions', id);
      return s ? decode(s) : null;
    },
    async saveSession(s, expected) {
      return write((d) => {
        const old = d.interview_sessions.find((x) => x.id === s.id);
        if ((old?.version ?? -1) !== expected) throw conflict();
        const row = {
          ...s,
          version: expected + 1,
          profile_snapshot: vault.seal(s.profile_snapshot),
        };
        d.interview_sessions = d.interview_sessions.filter((x) => x.id !== s.id);
        d.interview_sessions.push(row);
        return { ...s, version: row.version };
      });
    },
    async cleanup(days) {
      return write((d) => {
        let count = 0;
        const cutoff = Date.now() - days * 86400000;
        for (const s of d.interview_sessions) {
          if (!s.review_hold && !s.retained_at && Date.parse(s.started_at) < cutoff) {
            for (const a of s.answers) {
              if (a.transcript !== null) {
                a.transcript = null;
                a.evaluation = null;
                count++;
              }
            }
            s.profile_snapshot = vault.seal({});
            if (s.report) {
              s.report.recommendations = [];
              s.report.contradictions = [];
              s.report.missing_information = [];
            }
            s.retained_at = new Date().toISOString();
            s.version++;
            if (s.state !== 'REPORT') s.state = 'EXPIRED';
          }
        }
        return count;
      });
    },
  };
}
export function supabaseRepository(url, key, vault) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = async (query) => {
    const { data, error } = await query;
    if (error) {
      if (error.message.includes('version conflict')) throw conflict();
      throw Object.assign(new Error('Database operation failed.'), { cause: error });
    }
    return data;
  };
  return {
    kind: 'supabase',
    client,
    async list(table) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await result(
          client
            .from(table)
            .select('*')
            .order('id')
            .range(offset, offset + 999),
        );
        rows.push(...page);
        if (page.length < 1000) return rows;
      }
    },
    async get(table, id) {
      return result(client.from(table).select('*').eq('id', id).maybeSingle());
    },
    async put(table, row) {
      return result(client.from(table).upsert(row).select().single());
    },
    async remove(table, id) {
      return result(client.from(table).delete().eq('id', id));
    },
    async profile(id) {
      const p = await this.get('student_profiles', id);
      return p
        ? {
            ...vault.open(p.private_data),
            leaderboard_opt_in: p.leaderboard_opt_in,
            leaderboard_alias: p.leaderboard_alias,
          }
        : null;
    },
    async saveProfile(id, p) {
      return this.put('student_profiles', {
        id,
        private_data: vault.seal(p),
        leaderboard_opt_in: p.leaderboard_opt_in,
        leaderboard_alias: p.leaderboard_alias,
      });
    },
    async sessions() {
      const rows = await this.list('interview_sessions');
      return rows.map((r) => ({
        ...r.data,
        id: r.id,
        student_id: r.student_id,
        version: r.version,
        profile_snapshot: {},
        report: r.report_summary
          ? { ...r.report_summary, scoring_version: r.data.report_scoring_version || null }
          : null,
        answers: [],
      }));
    },
    async session(id) {
      const row = await this.get('interview_sessions', id);
      if (!row) return null;
      const answers = await result(
        client.from('interview_answers').select('data').eq('session_id', id).order('sequence'),
      );
      const report = await result(
        client.from('reports').select('report_json').eq('session_id', id).maybeSingle(),
      );
      return {
        ...row.data,
        id: row.id,
        student_id: row.student_id,
        version: row.version,
        profile_snapshot: vault.open(row.profile_snapshot),
        answers: answers.map((a) => a.data),
        report: report?.report_json ?? null,
      };
    },
    async saveSession(s, expected) {
      const { answers, report, profile_snapshot, id, student_id, version, ...data } = s;
      data.report_scoring_version = report?.scoring_version || null;
      await result(
        client.rpc('save_interview', {
          p_id: id,
          p_student: student_id,
          p_expected: expected,
          p_data: data,
          p_profile: vault.seal(profile_snapshot),
          p_answers: answers,
          p_report: report,
        }),
      );
      return { ...s, version: expected + 1 };
    },
    async cleanup(days) {
      return result(client.rpc('purge_transcripts', { retention_days: days }));
    },
  };
}
