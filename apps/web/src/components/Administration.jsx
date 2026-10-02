import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Copy,
  CreditCard,
  Gift,
  Package,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { api } from '../services/api';
import { Badge, Button, Field, SearchInput, Stat, Tabs, Title, date } from './common';

const roleTone = { admin: 'role-admin', counsellor: 'role-counsellor', student: 'role-student' };
const QUESTIONS_PER_INTERVIEW = 19;
const TABS = [
  ['overview', 'Overview'],
  ['accounts', 'Accounts & access'],
  ['credits', 'Student credits'],
  ['packages', 'Packages'],
  ['audit', 'Audit log'],
];

export default function Administration({ run }) {
  const [tab, setTab] = useState('overview');
  const [users, setUsers] = useState([]),
    [assignments, setAssignments] = useState([]),
    [logs, setLogs] = useState([]),
    [packages, setPackages] = useState([]),
    [c, setC] = useState(''),
    [s, setS] = useState('');
  const [newName, setNewName] = useState(''),
    [newEmail, setNewEmail] = useState(''),
    [newPhone, setNewPhone] = useState(''),
    [newRole, setNewRole] = useState('student'),
    [creating, setCreating] = useState(false),
    [created, setCreated] = useState(null);
  const [pkgName, setPkgName] = useState(''),
    [pkgPrice, setPkgPrice] = useState(''),
    [pkgCredits, setPkgCredits] = useState(''),
    [pkgBusy, setPkgBusy] = useState(false);
  const [creditQuery, setCreditQuery] = useState(''),
    [creditFilter, setCreditFilter] = useState('all'),
    [creditStudent, setCreditStudent] = useState(''),
    [history, setHistory] = useState([]),
    [purchasePackageId, setPurchasePackageId] = useState(''),
    [purchaseNote, setPurchaseNote] = useState(''),
    [purchaseBusy, setPurchaseBusy] = useState(false),
    [grantAmount, setGrantAmount] = useState(''),
    [grantBusy, setGrantBusy] = useState(false);
  async function load() {
    const [u, a, l, p] = await Promise.all([
      api('/users'),
      api('/assignments'),
      api('/audit'),
      api('/packages'),
    ]);
    setUsers(u);
    setAssignments(a);
    setLogs(l);
    setPackages(p);
  }
  useEffect(() => {
    run(load);
  }, []);
  const name = (id) => users.find((u) => u.id === id)?.name || id;
  const staff = useMemo(() => users.filter((u) => u.role !== 'student'), [users]);
  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);
  const counsellorCount = staff.filter((u) => u.role === 'counsellor').length,
    adminCount = staff.filter((u) => u.role === 'admin').length;
  const creditTarget = students.find((u) => u.id === creditStudent);
  const filteredStudents = useMemo(() => {
    const q = creditQuery.trim().toLowerCase();
    return students
      .filter((u) => !q || [u.name, u.email].filter(Boolean).some((v) => v.toLowerCase().includes(q)))
      .filter((u) => {
        if (creditFilter === 'out-of-interviews')
          return Math.floor((u.interview_question_credits_remaining ?? 0) / QUESTIONS_PER_INTERVIEW) < 1;
        if (creditFilter === 'out-of-free') return (u.free_questions_remaining ?? 0) < 1;
        return true;
      });
  }, [students, creditQuery, creditFilter]);
  useEffect(() => {
    if (!creditTarget) {
      setHistory([]);
      return;
    }
    run(() => api(`/students/${creditTarget.id}/credit-history`)).then((h) => h && setHistory(h));
  }, [creditTarget?.id]);
  return (
    <>
      <Title
        eyebrow="ADMINISTRATION"
        title="Your admin portal."
        description="Accounts, assignments, interview credits and staff access, all in one place."
      />
      <Tabs options={TABS} value={tab} onChange={setTab} />
      {tab === 'overview' && (
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
          <Stat icon={Users} title="Students" value={students.length} note="Total student accounts" />
          <Stat
            icon={CreditCard}
            title="Out of interview credit"
            value={
              students.filter(
                (u) =>
                  Math.floor((u.interview_question_credits_remaining ?? 0) / QUESTIONS_PER_INTERVIEW) < 1,
              ).length
            }
            note="Need a package renewed"
          />
          <Stat
            icon={Gift}
            title="Out of free questions"
            value={students.filter((u) => (u.free_questions_remaining ?? 0) < 1).length}
            note="Used their free trial"
          />
          <Stat icon={Package} title="Packages available" value={packages.length} note="Active credit packages" />
        </div>
      )}
      {tab === 'accounts' && (
        <>
          <section className="card">
            <h2>Create an account</h2>
            <p className="muted">
              Self-registration is disabled. Accounts (student, counsellor or admin) are created
              here; share the one-time password with the person directly.
            </p>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                setCreating(true);
                const result = await run(async () => {
                  const r = await api('/users', 'POST', {
                    name: newName,
                    email: newEmail,
                    ...(newPhone ? { phone: newPhone } : {}),
                    role: newRole,
                  });
                  await load();
                  return r;
                });
                setCreating(false);
                if (result) {
                  setCreated(result);
                  setNewName('');
                  setNewEmail('');
                  setNewPhone('');
                  setNewRole('student');
                }
              }}
            >
              <Field name="name" label="Full name" value={newName} onChange={setNewName} required />
              <Field name="email" type="email" value={newEmail} onChange={setNewEmail} required />
              <Field
                name="phone"
                type="tel"
                label="Phone (optional)"
                value={newPhone}
                onChange={setNewPhone}
              />
              <label className="field">
                Role
                <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="student">Student</option>
                  <option value="counsellor">Counsellor</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <Button disabled={creating}>
                <UserPlus size={17} />
                {creating ? 'Creating…' : 'Create account'}
              </Button>
            </form>
            {created && (
              <div className="alert">
                <b>
                  Account created for {created.name} ({created.role})
                </b>
                <p>
                  Email: {created.email}
                  <br />
                  One-time password: <code>{created.password}</code>
                </p>
                <Button
                  secondary
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(created.password)}
                >
                  <Copy size={15} />
                  Copy password
                </Button>
                <p className="muted">
                  This password is shown once and not stored anywhere else. Share it directly
                  with {created.name}.
                </p>
              </div>
            )}
          </section>
          <section className="card">
            <h2>Staff directory</h2>
            {staff.length ? (
              <div className="staff-directory">
                {staff.map((u) => (
                  <div className="staff-row" key={u.id}>
                    <span className="avatar-sm">
                      {(u.name || u.email || '?').slice(0, 1).toUpperCase()}
                    </span>
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
                  {staff
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
                  {students.map((u) => (
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
            <p className="muted">Create counsellor and admin accounts above, with the matching role.</p>
          </section>
        </>
      )}
      {tab === 'credits' && (
        <section className="card">
          <h2>Student credits</h2>
          <p className="muted">
            Record a package a student paid for offline, or grant extra free practice questions.
            Once a balance runs out, the student is told to contact you here.
          </p>
          <div className="credit-manager">
            <div>
              <SearchInput value={creditQuery} onChange={setCreditQuery} placeholder="Search students…" />
              <div className="tabs credit-filter-tabs">
                {[
                  ['all', 'All'],
                  ['out-of-interviews', 'Out of interviews'],
                  ['out-of-free', 'Out of free questions'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={creditFilter === id ? 'active' : ''}
                    onClick={() => setCreditFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="credit-list">
                {filteredStudents.length ? (
                  filteredStudents.map((u) => {
                    const interviews = Math.floor(
                      (u.interview_question_credits_remaining ?? 0) / QUESTIONS_PER_INTERVIEW,
                    );
                    const free = u.free_questions_remaining ?? 0;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        className={`credit-row${creditStudent === u.id ? ' active' : ''}`}
                        onClick={() => setCreditStudent(u.id)}
                      >
                        <span className="avatar-sm">
                          {(u.name || u.email || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <div>
                          <b>{u.name || u.email}</b>
                          <small>{u.email}</small>
                        </div>
                        <div className="credit-row-balance">
                          <Badge tone={interviews > 0 ? 'on' : 'off'}>{interviews} interviews</Badge>
                          <Badge tone={free > 0 ? 'on' : 'off'}>{free} free</Badge>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className="muted">No students match.</p>
                )}
              </div>
            </div>
            <div className="credit-detail">
              {!creditTarget ? (
                <div className="empty">
                  <p>Choose a student from the list to manage their credits.</p>
                </div>
              ) : (
                <>
                  <div className="section-title">
                    <h3>{creditTarget.name || creditTarget.email}</h3>
                    <span className="pill">
                      {Math.floor(
                        (creditTarget.interview_question_credits_remaining ?? 0) /
                          QUESTIONS_PER_INTERVIEW,
                      )}{' '}
                      interviews · {creditTarget.free_questions_remaining ?? 0} free
                    </span>
                  </div>
                  <form
                    className="form-grid"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setPurchaseBusy(true);
                      const result = await run(async () => {
                        await api(`/students/${creditTarget.id}/purchases`, 'POST', {
                          package_id: purchasePackageId,
                          ...(purchaseNote ? { note: purchaseNote } : {}),
                        });
                        await load();
                      });
                      setPurchaseBusy(false);
                      if (result !== null) {
                        setPurchasePackageId('');
                        setPurchaseNote('');
                        run(() => api(`/students/${creditTarget.id}/credit-history`)).then(
                          (h) => h && setHistory(h),
                        );
                      }
                    }}
                  >
                    <label className="field">
                      Package purchased
                      <select
                        required
                        value={purchasePackageId}
                        onChange={(e) => setPurchasePackageId(e.target.value)}
                      >
                        <option value="">Choose package</option>
                        {packages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — Rs {p.price_rs}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      name="note"
                      label="Note (optional)"
                      placeholder="e.g. paid by bank transfer"
                      value={purchaseNote}
                      onChange={setPurchaseNote}
                    />
                    <Button disabled={purchaseBusy}>
                      <CreditCard size={16} />
                      {purchaseBusy ? 'Recording…' : 'Record purchase'}
                    </Button>
                  </form>
                  <form
                    className="actions"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setGrantBusy(true);
                      const result = await run(async () => {
                        await api(`/students/${creditTarget.id}/grant-free-questions`, 'POST', {
                          amount: Number(grantAmount),
                        });
                        await load();
                      });
                      setGrantBusy(false);
                      if (result !== null) {
                        setGrantAmount('');
                        run(() => api(`/students/${creditTarget.id}/credit-history`)).then(
                          (h) => h && setHistory(h),
                        );
                      }
                    }}
                  >
                    <Field
                      name="amount"
                      type="number"
                      label="Grant free questions"
                      value={grantAmount}
                      onChange={setGrantAmount}
                      required
                    />
                    <Button secondary disabled={grantBusy}>
                      <Gift size={16} />
                      {grantBusy ? 'Granting…' : 'Grant'}
                    </Button>
                  </form>
                  <h3>Purchase history</h3>
                  {history.length ? (
                    <div className="credit-history">
                      {history.map((h) => (
                        <div className="credit-history-row" key={h.id}>
                          {h.type === 'purchase' ? <CreditCard size={14} /> : <Gift size={14} />}
                          <div>
                            <b>
                              {h.type === 'purchase'
                                ? `${h.package_name} — Rs ${h.price_paid_rs}`
                                : `+${h.amount} free questions granted`}
                            </b>
                            <small>
                              {date(h.created_at)}
                              {h.note ? ` · ${h.note}` : ''}
                            </small>
                          </div>
                          {h.type === 'purchase' && (
                            <span className="credit-history-amount">
                              +{h.question_credits_granted}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No purchases or grants recorded yet.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}
      {tab === 'packages' && (
        <section className="card">
          <div className="section-title">
            <h2>Credit packages</h2>
            <span className="pill">{packages.length} active</span>
          </div>
          <p className="muted">
            A full interview is {QUESTIONS_PER_INTERVIEW} questions. A package's credits are
            converted to question-credits at purchase time (e.g. 5 interview credits grants{' '}
            {5 * QUESTIONS_PER_INTERVIEW} question-credits).
          </p>
          {packages.length ? (
            <div className="staff-directory">
              {packages.map((p) => (
                <div className="staff-row" key={p.id}>
                  <span className="avatar-sm">
                    <Package size={16} />
                  </span>
                  <div>
                    <b>{p.name}</b>
                    <small>
                      Rs {p.price_rs} · {p.interview_credits} full interview
                      {p.interview_credits === 1 ? '' : 's'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No packages defined yet.</p>
          )}
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              setPkgBusy(true);
              const result = await run(async () => {
                const p = await api('/packages', 'POST', {
                  name: pkgName,
                  price_rs: Number(pkgPrice),
                  interview_credits: Number(pkgCredits),
                });
                await load();
                return p;
              });
              setPkgBusy(false);
              if (result) {
                setPkgName('');
                setPkgPrice('');
                setPkgCredits('');
              }
            }}
          >
            <Field name="name" label="Package name" value={pkgName} onChange={setPkgName} required />
            <Field
              name="price_rs"
              type="number"
              label="Price (Rs)"
              value={pkgPrice}
              onChange={setPkgPrice}
              required
            />
            <Field
              name="interview_credits"
              type="number"
              label="Full interviews included"
              value={pkgCredits}
              onChange={setPkgCredits}
              required
            />
            <Button disabled={pkgBusy}>
              <Package size={16} />
              {pkgBusy ? 'Creating…' : 'Create package'}
            </Button>
          </form>
        </section>
      )}
      {tab === 'audit' && (
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
      )}
    </>
  );
}
