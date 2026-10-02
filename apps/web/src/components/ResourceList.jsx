import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Title } from './common';

// Module-level cache (survives for the browser session): students bounce between Templates
// and Research Methods often, and the content rarely changes, so repeat visits should be
// instant instead of re-paying the network round trip every time.
const cache = new Map();

export default function ResourceList({ run, kind, eyebrow, title, description }) {
  const [rows, setRows] = useState(() => cache.get(kind) ?? null);
  useEffect(() => {
    const cached = cache.get(kind);
    if (cached) {
      setRows(cached);
      return;
    }
    setRows(null);
    run(() =>
      api(`/resources?kind=${kind}`).then((data) => {
        cache.set(kind, data);
        setRows(data);
      }),
    );
  }, [kind]);
  return (
    <>
      <Title eyebrow={eyebrow} title={title} description={description} />
      {rows === null && <div className="card empty">Loading…</div>}
      {rows?.length === 0 && (
        <div className="card empty">Nothing published here yet. Check back soon.</div>
      )}
      {rows?.map((r) => (
        <section className="card resource" key={r.id}>
          <h2>{r.title}</h2>
          <p className="pre">{r.body}</p>
        </section>
      ))}
    </>
  );
}
