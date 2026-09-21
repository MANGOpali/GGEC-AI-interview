import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { AttemptList, Title, label } from './common';

export default function Students({ sessions, run, openSession }) {
  const [students, setStudents] = useState([]);
  useEffect(() => {
    run(() => api('/students').then(setStudents));
  }, []);
  return (
    <>
      <Title
        eyebrow="COUNSELLOR TOOLS"
        title="Every student has a story."
        description="Review assigned student profiles, saved transcripts and progress across attempts."
      />
      {students.length === 0 && <div className="card empty">No students are assigned to you yet.</div>}
      {students.map((s) => (
        <section className="card student-card" key={s.id}>
          <h2>{s.profile?.name || s.name || s.email || 'Student'}</h2>
          <p>
            {s.profile?.university || 'Profile not completed'}
            {s.profile?.course ? ` · ${s.profile.course}` : ''}
          </p>
          {s.profile && (
            <details>
              <summary>View student profile</summary>
              <dl>
                {Object.entries(s.profile)
                  .filter(([k]) => !k.startsWith('leaderboard'))
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{label(k)}</dt>
                      <dd>{String(v) || '—'}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
          <AttemptList sessions={sessions.filter((a) => a.student_id === s.id)} open={openSession} />
          {!sessions.some((a) => a.student_id === s.id) && <p className="muted">No attempts yet.</p>}
        </section>
      ))}
    </>
  );
}