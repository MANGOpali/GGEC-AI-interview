import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Button, Field, Title, label } from './common';
import QuestionAngles from './QuestionAngles';
import StandardsBank from './StandardsBank';

const blankQuestion = {
  text: '',
  category: '',
  expected_concepts: '',
  verified_context: '',
  source_url: '',
  weight: 1,
  is_main_question: true,
  active: true,
  time_limit_seconds: null,
};
const timeOptions = [30, 45, 60, 90, 120, 150, 180, 240, 300, 450, 600];
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export default function Questions({ run }) {
  const [rows, setRows] = useState([]),
    [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(null);
  const load = () => api('/questions').then(setRows);
  useEffect(() => {
    run(load);
  }, []);
  return (
    <>
      <Title
        eyebrow="COUNSELLOR TOOLS"
        title="A better conversation starts here."
        description="Manage questions, category weights, expected concepts and verified source context."
      />
      <StandardsBank run={run} legacyQuestions={rows} />
      <h2>Existing question library and category practice</h2>
      <Button onClick={() => setEdit({ ...blankQuestion })}>
        <Plus size={17} />
        Add question
      </Button>
      <p>
        {rows.length} saved questions · {rows.filter((q) => q.is_main_question).length} main ·{' '}
        {rows.filter((q) => !q.is_main_question).length} reference/practice
      </p>
      <QuestionAngles />
      {edit && (
        <form
          className="card question-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const result = await run(async () => {
              await api(
                edit.id ? `/questions/${edit.id}` : '/questions',
                edit.id ? 'PUT' : 'POST',
                edit,
              );
              await load();
              return true;
            });
            if (result) setEdit(null);
            setBusy(false);
          }}
        >
          <h2>{edit.id ? 'Edit question' : 'New question'}</h2>
          {[
            'text',
            'category',
            'expected_concepts',
            'verified_context',
            'source_url',
            'weight',
          ].map((k) => (
            <Field
              key={k}
              name={k}
              value={edit[k]}
              required={['text', 'category', 'weight'].includes(k)}
              type={
                k === 'weight'
                  ? 'number'
                  : ['text', 'expected_concepts', 'verified_context'].includes(k)
                    ? 'textarea'
                    : 'text'
              }
              onChange={(v) => setEdit({ ...edit, [k]: v })}
            />
          ))}
          <label className="field">
            Answer time limit
            <select
              value={edit.time_limit_seconds ?? ''}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  time_limit_seconds: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Course default (main 2:00, follow-up 1:00)</option>
              {timeOptions.map((s) => (
                <option key={s} value={s}>
                  {clock(s)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Weight must be greater than 0 and at most 10. Use the same weight on questions in a
            category for category weighting. The time limit of 15 to 900 seconds applies to main
            questions; follow-ups always get one minute. Leave it on the default to use the course
            standard. New interviews use factual evidence only from a dated reference matching the
            student university, course and intake. Set an HTTPS source URL above.
          </p>
          <fieldset>
            <legend>Verified course reference</legend>
            <p>
              Use an official university source. Record the course intake and the date you checked
              it. The app cannot verify a page merely from its URL.
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={!!edit.reference}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    reference: e.target.checked
                      ? {
                          university: '',
                          course: '',
                          intake: '',
                          checked_on: new Date().toISOString().slice(0, 10),
                          valid_until: '',
                          modules: '',
                          fees: '',
                          facts: edit.verified_context || '',
                        }
                      : null,
                  })
                }
              />
              Attach a checked reference to this question
            </label>
            {edit.reference &&
              [
                'university',
                'course',
                'intake',
                'checked_on',
                'valid_until',
                'modules',
                'fees',
                'facts',
              ].map((k) => (
                <Field
                  key={k}
                  name={k}
                  required={!['modules', 'fees'].includes(k)}
                  value={edit.reference[k]}
                  type={
                    ['checked_on', 'valid_until'].includes(k)
                      ? 'date'
                      : ['modules', 'fees', 'facts'].includes(k)
                        ? 'textarea'
                        : 'text'
                  }
                  onChange={(v) => setEdit({ ...edit, reference: { ...edit.reference, [k]: v } })}
                />
              ))}
          </fieldset>
          {['is_main_question', 'active'].map((k) => (
            <label key={k} className="checkbox">
              <input
                type="checkbox"
                checked={edit[k]}
                onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })}
              />
              {label(k)}
            </label>
          ))}
          <div className="actions">
            <Button disabled={busy}>Save question</Button>
            <Button secondary type="button" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="card bank">
        {rows.map((q) => (
          <article key={q.id}>
            <div>
              <span className="eyebrow">
                {q.category} · Weight {q.weight} ·{' '}
                {q.time_limit_seconds ? `Time ${clock(q.time_limit_seconds)}` : 'Time default'} ·{' '}
                {q.active ? 'Active' : 'Inactive'}
              </span>
              <h3>{q.text}</h3>
              <p>{q.expected_concepts}</p>
              {q.reference ? (
                <p>
                  Reference: {q.reference.university} · {q.reference.course} · {q.reference.intake}.
                  Checked {q.reference.checked_on}; review by {q.reference.valid_until}.{' '}
                  {q.reference.valid_until < new Date().toISOString().slice(0, 10)
                    ? 'Expired — update before use.'
                    : ''}
                </p>
              ) : (
                <p>No dated course reference attached.</p>
              )}
              <small>
                {q.is_main_question
                  ? 'Main question'
                  : 'Reference only · contextual follow-ups are AI-generated'}
              </small>
            </div>
            <button
              className="icon-button"
              title="Edit question"
              aria-label={`Edit ${q.text}`}
              onClick={() => setEdit(q)}
            >
              <Pencil size={17} />
            </button>
            <button
              className="icon-button danger"
              title="Delete question"
              aria-label={`Delete ${q.text}`}
              onClick={() => setRemove(q.id)}
            >
              <Trash2 size={17} />
            </button>
            {remove === q.id && (
              <div className="actions">
                <Button
                  secondary
                  onClick={() =>
                    run(async () => {
                      await api(`/questions/${q.id}`, 'DELETE');
                      setRemove(null);
                      await load();
                    })
                  }
                >
                  Confirm delete
                </Button>
                <button className="text-button" onClick={() => setRemove(null)}>
                  Cancel
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
