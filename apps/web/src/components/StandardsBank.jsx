import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Button, Field } from './common';
const blank = (type) => ({
  type,
  parent_id: null,
  introduction: false,
  text: '',
  category: '',
  active: true,
  weight: 1,
  points: [],
});
export default function StandardsBank({ run, legacyQuestions = [] }) {
  const [bank, setBank] = useState(null),
    [edit, setEdit] = useState(null),
    [tab, setTab] = useState('major'),
    [busy, setBusy] = useState(false);
  const load = () => api('/standards-bank').then(setBank);
  useEffect(() => {
    run(load);
  }, []);
  const perform = async (action) => {
    setBusy(true);
    try {
      await run(async () => {
        await action();
        await load();
      });
    } finally {
      setBusy(false);
    }
  };
  if (!bank) return <p>Loading standards bank…</p>;
  const majors = bank.questions.filter((q) => q.type === 'major');
  return (
    <section className="card">
      <h2>19-question interview standards</h2>
      <p>
        19 questions: 7 majors, 0–9 crosses and extra questions filling the remaining slots. Each
        major may have 0–3 crosses. Add more extras to allow fewer crosses. Introduction first.
        Standards 60%, clarity 20%, grammar 10%, correctness 10%.
      </p>
      <p>
        {bank.enabled
          ? 'Enabled for new full interviews'
          : 'Draft — existing interview format remains active'}{' '}
        · Revision {bank.revision}
      </p>
      {!bank.readiness.ready && (
        <ul>
          {bank.readiness.issues.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {bank.can_configure && (
        <div>
          <Field
            name="Grammar allowance (% of sentences)"
            type="number"
            value={bank.grammar_allowance}
            onChange={(value) => setBank({ ...bank, grammar_allowance: Number(value) })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={bank.enabled}
              onChange={(e) => setBank({ ...bank, enabled: e.target.checked })}
            />
            Enable 19-question format (requires a complete bank)
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              perform(() =>
                api('/standards-bank/settings', 'PUT', {
                  revision: bank.revision,
                  enabled: bank.enabled,
                  grammar_allowance: bank.grammar_allowance,
                }),
              )
            }
          >
            Save interview settings
          </Button>
        </div>
      )}
      <p>
        English marks assess transcript clarity and grammar, not accent, pace or verified spoken
        fluency. Grammar within the allowance gets full grammar credit; above it the deduction
        increases gradually.
      </p>
      <div className="actions">
        {['major', 'cross', 'extra'].map((type) => (
          <Button
            key={type}
            secondary
            onClick={() => {
              setTab(type);
              setEdit(null);
            }}
          >
            {type === 'major'
              ? 'Major questions'
              : type === 'cross'
                ? 'Cross-questions'
                : 'Extra questions'}{' '}
            ({bank.questions.filter((q) => q.type === type).length})
          </Button>
        ))}
      </div>
      <Button disabled={busy} onClick={() => setEdit(blank(tab))}>
        Add {tab} question
      </Button>
      {edit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await api('/standards-bank/questions', 'POST', {
                revision: bank.revision,
                question: edit,
              });
              setEdit(null);
            });
          }}
        >
          <h3>
            {edit.id ? 'Edit' : 'New'} {edit.type} question
          </h3>
          {!edit.id && edit.type !== 'cross' && (
            <label className="field">
              Copy wording from existing bank
              <select
                value=""
                onChange={(e) => {
                  const q = legacyQuestions.find((q) => q.id === e.target.value);
                  if (q)
                    setEdit({
                      ...edit,
                      text: q.text,
                      category: q.category,
                      introduction: edit.type === 'major' && q.category === 'Introduction',
                    });
                }}
              >
                <option value="">Choose existing wording (standards stay empty)</option>
                {legacyQuestions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text}
                  </option>
                ))}
              </select>
            </label>
          )}
          {edit.type === 'cross' && (
            <label className="field">
              Parent major question
              <select
                required
                value={edit.parent_id || ''}
                onChange={(e) => {
                  const p = majors.find((q) => q.id === e.target.value);
                  setEdit({ ...edit, parent_id: e.target.value, category: p?.category || '' });
                }}
              >
                <option value="">Select major</option>
                {majors.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Field
            name="Question"
            type="textarea"
            required
            value={edit.text}
            onChange={(text) => setEdit({ ...edit, text })}
          />
          <Field
            name="Category"
            required
            value={edit.category}
            onChange={(category) => setEdit({ ...edit, category })}
          />
          <Field
            name="Question weight"
            type="number"
            value={edit.weight}
            onChange={(v) => setEdit({ ...edit, weight: Number(v) })}
          />
          {edit.type === 'major' && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={edit.introduction}
                onChange={(e) => setEdit({ ...edit, introduction: e.target.checked })}
              />
              This is the Introduction (always first)
            </label>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={edit.active}
              onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
            />
            Active
          </label>
          <h3>Your required standard points</h3>
          <p>
            Students may cover these in any order. Add acceptable equivalent examples where useful.
            Empty standards can be saved as drafts but cannot be used in the new interview.
          </p>
          {edit.points.map((point, index) => (
            <fieldset key={point.id}>
              <legend>Point {index + 1}</legend>
              <Field
                name="Required meaning"
                type="textarea"
                required
                value={point.text}
                onChange={(text) =>
                  setEdit({
                    ...edit,
                    points: edit.points.map((p) => (p.id === point.id ? { ...p, text } : p)),
                  })
                }
              />
              <Field
                name="Acceptable alternatives / examples"
                type="textarea"
                value={point.alternatives}
                onChange={(alternatives) =>
                  setEdit({
                    ...edit,
                    points: edit.points.map((p) =>
                      p.id === point.id ? { ...p, alternatives } : p,
                    ),
                  })
                }
              />
              <Field
                name="Point weight"
                type="number"
                value={point.weight}
                onChange={(v) =>
                  setEdit({
                    ...edit,
                    points: edit.points.map((p) =>
                      p.id === point.id ? { ...p, weight: Number(v) } : p,
                    ),
                  })
                }
              />
              <Button
                secondary
                type="button"
                onClick={() =>
                  setEdit({ ...edit, points: edit.points.filter((p) => p.id !== point.id) })
                }
              >
                Remove point
              </Button>
            </fieldset>
          ))}
          <Button
            secondary
            type="button"
            disabled={edit.points.length >= 20}
            onClick={() =>
              setEdit({
                ...edit,
                points: [
                  ...edit.points,
                  { id: crypto.randomUUID(), text: '', alternatives: '', weight: 1 },
                ],
              })
            }
          >
            Add standard point
          </Button>
          <div className="actions">
            <Button type="submit" disabled={busy}>
              Save question and standard
            </Button>
            <Button secondary type="button" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {bank.questions
        .filter((q) => q.type === tab)
        .map((q) => (
          <details key={q.id}>
            <summary>
              {q.introduction ? 'Introduction · ' : ''}
              {q.text} {!q.active ? '(inactive)' : ''}
            </summary>
            <p>
              {q.type === 'cross'
                ? `Parent: ${majors.find((m) => m.id === q.parent_id)?.text || 'Missing'}`
                : q.type === 'major'
                  ? `${bank.questions.filter((c) => c.type === 'cross' && c.parent_id === q.id && c.active).length}/5 active cross-questions`
                  : ''}
            </p>
            <p>
              {q.points.length} standard points · Version {q.version}
            </p>
            <ul>
              {q.points.map((p) => (
                <li key={p.id}>
                  {p.text}
                  {p.alternatives && ` — Alternatives: ${p.alternatives}`}
                </li>
              ))}
            </ul>
            <Button secondary disabled={busy} onClick={() => setEdit(structuredClone(q))}>
              Edit
            </Button>
            <Button
              secondary
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Delete this question and its standard? Existing interviews keep their snapshots.',
                  )
                )
                  void perform(() =>
                    api(`/standards-bank/questions/${q.id}`, 'DELETE', { revision: bank.revision }),
                  );
              }}
            >
              Delete
            </Button>
          </details>
        ))}
    </section>
  );
}
