import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Button, Title } from './common';

export default function Administration({ run }) {
  const [users, setUsers] = useState([]),
    [assignments, setAssignments] = useState([]),
    [logs, setLogs] = useState([]),
    [c, setC] = useState(''),
    [s, setS] = useState('');
  async function load() {
    const [u, a, l] = await Promise.all([api('/users'), api('/assignments'), api('/audit')]);
    setUsers(u);
    setAssignments(a);
    setLogs(l);
  }
  useEffect(() => {
    run(load);
  }, []);
  const name = (id) => users.find((u) => u.id === id)?.name || id;
  return (
    <>
      <Title
        eyebrow="ADMINISTRATION"
        title="Keep support connected."
        description="Assign counsellors and inspect the most recent staff access events."
      />
      <section className="card">
        <h2>Counsellor assignments</h2>
        <form
          className="actions"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api('/assignments', 'POST', { counsellor_id: c, student_id: s });
              await load();
            });
          }}
        >
          <label className="field">
            Counsellor
            <select required value={c} onChange={(e) => setC(e.target.value)}>
              <option value="">Choose counsellor</option>
              {users
                .filter((u) => u.role === 'counsellor')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Student
            <select required value={s} onChange={(e) => setS(e.target.value)}>
              <option value="">Choose student</option>
              {users
                .filter((u) => u.role === 'student')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
            </select>
          </label>
          <Button>Assign</Button>
        </form>
        {assignments.map((a) => (
          <p className="assignment" key={a.id}>
            {name(a.counsellor_id)} → {name(a.student_id)}
            <button
              className="text-button danger"
              onClick={() =>
                run(async () => {
                  await api(`/assignments/${a.id}`, 'DELETE');
                  await load();
                })
              }
            >
              Remove
            </button>
          </p>
        ))}
        <p className="muted">
          Staff roles are provisioned through trusted database administration. Signup always creates
          a Student account.
        </p>
      </section>
      <section className="card audit">
        <h2>Recent audit events</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Staff member</th>
              <th>Resource</th>
              <th>Student</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td>{name(l.actor_id)}</td>
                <td>{l.resource}</td>
                <td>{name(l.student_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!logs.length && <p>No staff access events yet.</p>}
      </section>
    </>
  );
}