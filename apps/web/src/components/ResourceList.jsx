import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Title } from './common';

export default function ResourceList({ run, kind, eyebrow, title, description }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    run(() => api(`/resources?kind=${kind}`).then(setRows));
  }, [kind]);
  return (
    <>
      <Title eyebrow={eyebrow} title={title} description={description} />
      {rows.length === 0 && (
        <div className="card empty">Nothing published here yet. Check back soon.</div>
      )}
      {rows.map((r) => (
        <section className="card resource" key={r.id}>
          <h2>{r.title}</h2>
          <p className="pre">{r.body}</p>
        </section>
      ))}
    </>
  );
}
