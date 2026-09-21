import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { resourcePresets } from '../content/resourcePresets';
import { Button, Field, Title, label } from './common';

const blankResource = { kind: 'template', title: '', body: '', position: 0, active: true };
export default function ResourceAdmin({ run }) {
  const [rows, setRows] = useState([]),
    [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(null);
  const load = () => api('/resources').then(setRows);
  useEffect(() => {
    run(load);
  }, []);
  return (
    <>
      <Title
        eyebrow="ADMINISTRATION"
        title="Student resources."
        description="Publish the templates and research methods students see in their workspace."
      />
      <Button onClick={() => setEdit({ ...blankResource })}>
        <Plus size={17} />
        New resource
      </Button>
      {edit && (
        <form
          className="card question-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const saved = await run(async () => {
              await api(
                edit.id ? `/resources/${edit.id}` : '/resources',
                edit.id ? 'PUT' : 'POST',
                edit,
              );
              await load();
              return true;
            });
            if (saved) setEdit(null);
            setBusy(false);
          }}
        >
          <h2>{edit.id ? 'Edit resource' : 'New resource'}</h2>
          <label className="field">
            Start from a starter
            <select
              value=""
              onChange={(e) => {
                const preset = resourcePresets.find((p) => p.id === e.target.value);
                if (preset)
                  setEdit({
                    ...edit,
                    kind: preset.kind,
                    title: preset.title,
                    body: preset.body,
                  });
              }}
            >
              <option value="">Choose a starter template...</option>
              <optgroup label="Templates">
                {resourcePresets
                  .filter((p) => p.kind === 'template')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Research methods">
                {resourcePresets
                  .filter((p) => p.kind === 'research')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          <p className="muted">
            Choosing a starter fills the title and body below. Review and edit them before saving.
          </p>
          <label className="field">
            Kind
            <select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>
              <option value="template">Template</option>
              <option value="research">Research method</option>
            </select>
          </label>
          <Field
            name="title"
            value={edit.title}
            required
            onChange={(v) => setEdit({ ...edit, title: v })}
          />
          <Field
            name="body"
            value={edit.body}
            type="textarea"
            onChange={(v) => setEdit({ ...edit, body: v })}
          />
          <Field
            name="position"
            value={edit.position}
            type="number"
            onChange={(v) => setEdit({ ...edit, position: v })}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={edit.active}
              onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
            />
            Published to students
          </label>
          <div className="actions">
            <Button disabled={busy}>Save resource</Button>
            <Button secondary type="button" onClick={() => setEdit(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <div className="card bank">
        {rows.map((r) => (
          <article key={r.id}>
            <div>
              <span className="eyebrow">
                {label(r.kind)} · Position {r.position} · {r.active ? 'Published' : 'Hidden'}
              </span>
              <h3>{r.title}</h3>
              <p className="pre">{r.body}</p>
            </div>
            <button
              className="icon-button"
              title="Edit resource"
              aria-label={`Edit ${r.title}`}
              onClick={() => setEdit(r)}
            >
              <Pencil size={17} />
            </button>
            <button
              className="icon-button danger"
              title="Delete resource"
              aria-label={`Delete ${r.title}`}
              onClick={() => setRemove(r.id)}
            >
              <Trash2 size={17} />
            </button>
            {remove === r.id && (
              <div className="actions">
                <Button
                  secondary
                  onClick={() =>
                    run(async () => {
                      await api(`/resources/${r.id}`, 'DELETE');
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
        {!rows.length && <p className="muted">No resources yet.</p>}
      </div>
    </>
  );
}
