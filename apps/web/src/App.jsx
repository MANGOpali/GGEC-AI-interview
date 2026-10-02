import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BookOpen,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mic,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';
import { api, auth, health } from './services/api';
import { label } from './components/common';
import Login from './components/Login';
// Lazy-loaded: each becomes its own chunk, fetched only when a user actually navigates to it,
// instead of every role downloading every other role's pages up front (students never need
// Administration/Questions/Students/Calibration; staff rarely need the student-only pages).
const Dashboard = lazy(() => import('./components/Dashboard'));
const Calibration = lazy(() => import('./components/Calibration'));
const Profile = lazy(() => import('./components/Profile'));
const Interview = lazy(() => import('./components/Interview'));
const Questions = lazy(() => import('./components/Questions'));
const Students = lazy(() => import('./components/Students'));
const Leaderboard = lazy(() => import('./components/Leaderboard'));
const Administration = lazy(() => import('./components/Administration'));
const ResourceList = lazy(() => import('./components/ResourceList'));
const ResourceAdmin = lazy(() => import('./components/ResourceAdmin'));

const ROOT = { student: 'student', counsellor: 'counsellor', admin: 'admin' };
const ALLOWED = {
  student: ['dashboard', 'profile', 'interview', 'templates', 'research'],
  counsellor: ['dashboard', 'students', 'questions', 'ranking', 'practice', 'calibration'],
  admin: [
    'dashboard',
    'students',
    'questions',
    'ranking',
    'admin',
    'practice',
    'calibration',
    'resources',
  ],
};
const HOME = { student: 'dashboard', counsellor: 'dashboard', admin: 'dashboard' };
const DEFAULT_ROLE = 'student';
function urlFor(role, page) {
  const root = ROOT[role] || DEFAULT_ROLE;
  return page === HOME[role] ? `/${root}` : `/${root}/${page}`;
}
function resolve(pathname, role) {
  const r = ROOT[role] ? role : DEFAULT_ROLE;
  const parts = pathname.split('/').filter(Boolean);
  const root = parts[0];
  const page = parts[1] || HOME[r];
  if (root !== ROOT[r] || !ALLOWED[r].includes(page)) {
    const home = HOME[r];
    return { url: urlFor(r, home), page: home, ok: false };
  }
  return { url: urlFor(r, page), page, ok: true };
}

export default function App() {
  const [config, setConfig] = useState(null),
    [user, setUser] = useState(null),
    [page, setPage] = useState('interview'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true),
    [profile, setProfile] = useState(null),
    [sessions, setSessions] = useState([]),
    [selected, setSelected] = useState(null),
    [testCategory, setTestCategory] = useState('');
  async function refresh() {
    const [u, p, s] = await Promise.all([api('/me'), api('/profile'), api('/sessions')]);
    setUser(u);
    setProfile(p);
    setSessions(s);
  }
  async function initialize() {
    setLoading(true);
    setError('');
    try {
      // refresh() already fetches /me (along with /profile and /sessions, in parallel) --
      // this used to also fetch /me on its own first, paying for an extra sequential round
      // trip on every login for data refresh() was about to fetch again anyway.
      setConfig(await health());
      await refresh();
    } catch (e) {
      if (e.status !== 401) setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    initialize();
  }, []);
  useEffect(() => {
    if (!user) return;
    const res = resolve(window.location.pathname, user.role);
    if (!res.ok) history.replaceState(null, '', res.url);
    setPage(res.page);
  }, [user]);
  useEffect(() => {
    const onPop = () => {
      if (!user) return;
      const res = resolve(window.location.pathname, user.role);
      if (!res.ok) history.replaceState(null, '', res.url);
      setPage(res.page);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [user]);
  function navigate(p) {
    setPage(p);
    history.pushState(null, '', urlFor(user?.role || DEFAULT_ROLE, p));
    setError('');
    setNotice('');
  }
  async function run(fn) {
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    }
  }
  const openSession = async (id) =>
    run(async () => {
      setSelected(await api(`/sessions/${id}`));
      navigate(user?.role === 'student' ? 'interview' : 'practice');
    });
  const startTestInterview = (category) => {
    setSelected(null);
    setTestCategory(category || '');
    navigate('practice');
  };
  if (loading)
    return (
      <div className="loading">
        GGEC <span>Preparing your practice space…</span>
      </div>
    );
  if (!user)
    return (
      <div className="auth">
        <div className="brand">
          <img className="brand-icon auth-brand-icon" src="/logo.jpg" alt="GGEC logo" />
          <span>
            GGEC<small>GLOBAL GATE</small>
          </span>
        </div>
        <h1>
          Your next chapter
          <br />
          starts with practice.
        </h1>
        <p>AI Pre-CAS Interview Simulator</p>
        <Login onSuccess={initialize} error={error} />
        {error && <p role="alert">{error}</p>}
      </div>
    );
  const staff = user.role !== 'student';
  const nav = staff
    ? [
        ['dashboard', LayoutDashboard, 'Dashboard'],
        ['students', Users, 'Student progress'],
        ['questions', BookOpen, 'Question bank'],
        ['calibration', ShieldCheck, 'Scoring comparison'],
        ['ranking', Trophy, 'Leaderboard'],
        ['practice', Mic, 'Test interview'],
        ...(user.role === 'admin'
          ? [
              ['resources', FileText, 'Resources'],
              ['admin', ShieldCheck, 'Administration'],
            ]
          : []),
      ]
    : [
        ['dashboard', LayoutDashboard, 'Dashboard'],
        ['profile', UserRound, 'Profile'],
        ['interview', Mic, 'Start Interview'],
        ['templates', LayoutTemplate, 'Templates'],
        ['research', FlaskConical, 'Research Methods'],
      ];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-icon" src="/logo.jpg" alt="GGEC logo" />
          <div>
            GGEC<small>GLOBAL GATE</small>
          </div>
        </div>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map(([id, Icon, name]) => (
            <button
              key={id}
              onClick={() => {
                // The Start Interview / Test interview nav buttons always start a fresh attempt --
                // a report left over from opening a past attempt (via Dashboard/Profile) must not
                // leak into this tab and show up instead of the consent screen.
                if (id === 'interview' || id === 'practice') setSelected(null);
                navigate(id);
              }}
              className={page === id ? 'active' : ''}
            >
              <Icon size={19} />
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <ShieldCheck size={22} />
            <strong>A space to improve</strong>
            <p>
              Practice at your pace.
              <br />
              Build a clearer, stronger story.
            </p>
          </div>
          <div className="user">
            <span className="avatar">{(profile?.name || user.name || 'S').slice(0, 1)}</span>
            <div>
              <b>{profile?.name || user.name || 'Student'}</b>
              <small>{label(user.role)} account</small>
            </div>
            <button
              title={config?.mode === 'demo' ? 'Restart demo view' : 'Sign out'}
              aria-label={config?.mode === 'demo' ? 'Restart demo view' : 'Sign out'}
              onClick={() =>
                run(async () => {
                  if (config?.mode === 'demo') {
                    setSelected(null);
                    setPage('interview');
                    await initialize();
                  } else {
                    await auth.signOut();
                    setSelected(null);
                    setProfile(null);
                    setSessions([]);
                    setUser(null);
                  }
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Interview preparation <span className="slash">/</span>{' '}
            <b>{nav.find((n) => n[0] === page)?.[2] || 'Interview review'}</b>
          </span>
          <span className="status-dot">
            {config?.ai === 'disabled' ? 'Transcript practice' : 'AI evaluation enabled'}
          </span>
        </header>
        <div className="content">
          {config?.mode === 'demo' && (
            <div className="demo-banner">
              <span>
                <b>LOCAL DEMO</b> Saved on this computer. Use sample information.
              </span>
              <select
                aria-label="Demo role"
                value={user.id}
                onChange={(e) => {
                  auth.setDemo(e.target.value);
                  setSelected(null);
                  setPage('interview');
                  initialize();
                }}
              >
                <option value="10000000-0000-4000-8000-000000000001">Student view</option>
                <option value="10000000-0000-4000-8000-000000000002">Counsellor view</option>
                <option value="10000000-0000-4000-8000-000000000003">Admin view</option>
              </select>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
            </div>
          )}
          <Suspense fallback={<div className="spinner" aria-hidden="true" />}>
          {page === 'dashboard' && (
            <Dashboard
              user={user}
              profile={profile}
              sessions={sessions}
              onStart={() => navigate('interview')}
              onProfile={() => navigate('profile')}
              openSession={openSession}
            />
          )}
          {page === 'profile' && (
            <Profile
              user={user}
              profile={profile}
              sessions={sessions}
              openSession={openSession}
              onSaveAccount={(patch) =>
                run(async () => {
                  const updated = await api('/me', 'PUT', patch);
                  setUser(updated);
                  setNotice('Account details saved.');
                  return true;
                })
              }
              onSaveStudy={(p) =>
                run(async () => {
                  await api('/profile', 'PUT', p);
                  setProfile(p);
                  setNotice('Study details saved. Your next interview will use these details.');
                  return true;
                })
              }
              onDeleteStudy={() =>
                run(async () => {
                  await api('/profile', 'DELETE');
                  setProfile(null);
                  setNotice(
                    'Study details deleted and leaderboard opt-in removed. Existing attempts follow the retention policy.',
                  );
                  return true;
                })
              }
            />
          )}
          {(page === 'interview' || page === 'practice') && (
            <Interview
              key={selected?.id || 'new'}
              initial={selected}
              profile={profile}
              user={user}
              staff={staff}
              initialCategory={testCategory}
              onError={setError}
              onUpdate={(s) => {
                setSelected(s);
                refresh().catch((e) => setError(e.message));
              }}
              onProfile={() => navigate('profile')}
            />
          )}
          {page === 'templates' && (
            <ResourceList
              run={run}
              kind="template"
              eyebrow="WRITING TOOLS"
              title="Answer templates."
              description="Structured starting points for common questions. Adapt every word to your own story."
            />
          )}
          {page === 'research' && (
            <ResourceList
              run={run}
              kind="research"
              eyebrow="RESEARCH METHODS"
              title="Research like an interviewer."
              description="How to verify the course, university and funding facts your answers rely on."
            />
          )}
          {page === 'resources' && <ResourceAdmin run={run} />}
          {page === 'calibration' && <Calibration sessions={sessions} run={run} />}
          {page === 'questions' && <Questions run={run} onTestInterview={startTestInterview} />}
          {page === 'students' && (
            <Students sessions={sessions} run={run} openSession={openSession} />
          )}
          {page === 'ranking' && (
            <Leaderboard run={run} onProfile={() => navigate('profile')} student={!staff} />
          )}
          {page === 'admin' && <Administration run={run} />}
          </Suspense>
          <footer>
            GLOBAL GATE EDUCATIONAL CONSULTANCY <span>Preparation for your next chapter.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
