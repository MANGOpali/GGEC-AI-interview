import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, ShieldCheck, UserCog, Users } from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, Stat, Title } from './common';

const roleTone = { admin: 'role-admin', counsellor: 'role-counsellor', student: 'role-student' };

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
  const staff = useMemo(() => users.filter((u) => u.role !== 'student'), [users]);
  const counsellorCount = staff.filter((u) => u.role === 'counsellor').length,
    adminCount = staff.filter((u) => u.role === 'admin').length;
  return (
    <>
      <Title
        eyebrow="ADMINISTRATION"
        title="Keep support connected."
        description="Assign counsellors and inspect the most recent staff access events."
      />
      <div className="stats">
        <Stat icon={Users} title="Staff accounts" value={staff.length} note="Counsellors and admins" />
        <Stat icon={UserCog} title="Counsellors" value={counsellorCount} note="Can review assigned students" />
        <Stat icon={ShieldCheck} title="Admins" value={adminCount} note="Full workspace access" />
        <Stat
          icon={ClipboardList}
          title="Active assignments"
          value={assignments.length}
          note="Counsellor ↔ student links"
        />
      </div>
      <section className="card">
        <h2>Staff directory</h2>
        {staff.length ? (
          <div className="staff-directory">
            {staff.map((u) => (
              <div className="staff-row" key={u.id}>
                <span className="avatar-sm">{(u.name || u.email || '?').slice(0, 1).toUpperCase()}</span>
                <div>
                  <b>{u.name || u.email}</b>
                  <small>{u.email}</small>
                </div>
                <Badge tone={roleTone[u.role] || 'muted'}>{u.role}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No staff accounts found.</p>
        )}
      </section>
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
        {assignments.length ? (
          assignments.map((a) => (
            <p className="assignment" key={a.id}>
              <span>
                {name(a.counsellor_id)} <Badge tone="muted">→</Badge> {name(a.student_id)}
              </span>
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
          ))
        ) : (
          <p className="muted">No counsellor is assigned to a student yet.</p>
        )}
        <p className="muted">
          Staff roles are provisioned through trusted database administration. Signup always creates
          a Student account.
        </p>
      </section>
      <section className="card audit">
        <div className="section-title">
          <h2>Recent audit events</h2>
          <span className="pill">{logs.length} events</span>
        </div>
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
                <td>
                  <Badge>{l.resource}</Badge>
                </td>
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