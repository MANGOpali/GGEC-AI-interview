import { useEffect, useRef, useState } from 'react';

import { api } from '../services/api';

import { Button } from './common';

export default function EvaluationProgress({ session, onUpdate }) {
  const [status, setStatus] = useState(null);

  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false);

  const [revision, setRevision] = useState(0);

  const update = useRef(onUpdate);

  update.current = onUpdate;

  useEffect(() => {
    let stopped = false,
      timer,
      previous = '';

    async function poll() {
      let delay = 6000;

      try {
        const next = await api(`/sessions/${session.id}/evaluation`);

        if (stopped) return;

        setStatus(next);
        setError('');

        const signature = `${next.state}:${next.evaluated}`;

        if (signature !== previous) {
          const saved = await api(`/sessions/${session.id}`);

          if (stopped) return;

          update.current?.(saved);

          previous = signature;
        }

        if (!['queued', 'running'].includes(next.state) && !next.retry_after) return;

        if (next.retry_after && Date.parse(next.retry_after) <= Date.now()) return;
      } catch {
        if (stopped) return;

        setError('Cannot check evaluation progress. Reconnecting… Your saved answers are safe.');

        delay = 15000;
      }

      if (!stopped) timer = setTimeout(poll, delay);
    }

    poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [session.id, revision]);

  async function retry() {
    setBusy(true);
    setError('');

    try {
      await api(`/sessions/${session.id}/evaluate`, 'POST', {});

      setStatus((s) => ({ ...s, state: 'queued', can_retry: false }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setRevision((v) => v + 1);
    }
  }

  const working = status && ['queued', 'running'].includes(status.state);

  return (
    <section className="card" aria-label="Evaluation progress">
      <h2>Answer evaluation</h2>

      <p role="status" aria-live="polite">
        {!status
          ? 'Checking evaluation…'
          : `${status.evaluated} of ${status.total} answers evaluated`}

        {working
          ? status.state === 'queued'
            ? ' · Waiting to start'
            : ' · Evaluating answers…'
          : ''}
      </p>

      {status && (
        <progress
          aria-label="Answers evaluated"
          max={Math.max(1, status.total)}
          value={status.evaluated}
          style={{ width: '100%' }}
        />
      )}

      {working && (
        <p className="muted">
          Each score is saved as it arrives. You can leave this page and return later. A slow AI
          provider can take over a minute per answer; a full interview may take much longer.
        </p>
      )}

      {status?.state === 'complete' && (
        <p>Evaluation complete. Your saved report is shown below.</p>
      )}

      {status?.message && <p className="alert">{status.message}</p>}

      {status && !status.enabled && (
        <p>
          AI evaluation is currently unavailable. Your saved answers remain available for review.
        </p>
      )}

      {status?.state === 'unavailable' && (
        <p>The transcripts for this attempt are no longer available for evaluation.</p>
      )}

      {error && <p role="alert">{error}</p>}

      {status?.can_retry && (
        <Button onClick={retry} disabled={busy}>
          {busy ? 'Requesting…' : status.evaluated ? 'Retry remaining answers' : 'Evaluate answers'}
        </Button>
      )}

      {!working && (
        <Button secondary disabled={busy} onClick={() => setRevision((v) => v + 1)}>
          Refresh progress
        </Button>
      )}
    </section>
  );
}
