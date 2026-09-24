import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Clock, Mic, ShieldCheck, Square, Volume2 } from 'lucide-react';
import { api } from '../services/api';
import { speech, voice } from '../services/speech';
import { transition } from '../services/machine';
import { Button, Title } from './common';
import Report from './Report';
import QuestionAngles from './QuestionAngles';

// Testing only: disables the auto-stop-at-timeout behavior below. Flip back to true to restore it.
const ENFORCE_TIME_LIMITS = false;
export default function Interview({
  initial,
  profile,
  staff,
  initialCategory,
  onError,
  onUpdate,
  onProfile,
}) {
  const [s, setS] = useState(initial),
    [consent, setConsent] = useState(false),
    [transcript, setTranscript] = useState(''),
    [phase, setPhase] = useState(initial?.state || 'CONSENT'),
    [busy, setBusy] = useState(false),
    [warning, setWarning] = useState('');
  const [micStatus, setMicStatus] = useState(''),
    [interim, setInterim] = useState(''),
    [micError, setMicError] = useState('');
  // A staff member starting a fresh attempt (no pre-loaded session) is testing the interview
  // themselves and should get the same live question flow a student gets, not the read-only
  // report view staff see when opening an existing student's session.
  const [testMode] = useState(staff && !initial);
  const [category, setCategory] = useState(initialCategory || ''),
    [categories, setCategories] = useState([]);
  const recorder = useRef(null),
    requestId = useRef(null);
  const [audioConsent, setAudioConsent] = useState(false);
  const [retryAudio, setRetryAudio] = useState(null);
  const [rules, setRules] = useState(null);
  const [spokenSeconds, setSpokenSeconds] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null),
    [timeUp, setTimeUp] = useState(false);
  const [submitElapsed, setSubmitElapsed] = useState(0);
  const submitTimer = useRef(null);
  const active =
    s && s.state !== 'REPORT' && s.state !== 'EXPIRED' && (!staff || testMode)
      ? s.pending_follow_up || s.questions[s.index]
      : null;
  const clock =
    secondsLeft == null
      ? null
      : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;
  const flexible = s?.rubric_version === 'ggec-standards-v3' && active?.question_type !== 'cross';
  useEffect(() => {
    if (!active || !s?.question_started_at) {
      setSecondsLeft(null);
      return;
    }
    const total = active.time_limit_seconds ?? (s.pending_follow_up ? 60 : 120);
    const started = Date.parse(s.question_started_at);
    let done = false;
    const tick = () => {
      const left = Number.isFinite(started)
        ? Math.max(0, Math.round(total - (Date.now() - started) / 1000))
        : total;
      setSecondsLeft(flexible ? total - left : left);
      if (left === 0 && !done && ENFORCE_TIME_LIMITS) {
        done = true;
        setTimeUp(true);
        recorder.current?.stop();
      }
    };
    setTimeUp(false);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active?.text, s?.pending_follow_up, s?.question_started_at, s?.version, flexible]);
  useEffect(() => {
    api('/interview-rules')
      .then(setRules)
      .catch((e) => onError(e.message));
    api('/questions')
      .then((q) =>
        setCategories([...new Set(q.filter((x) => x.is_main_question).map((x) => x.category))]),
      )
      .catch((e) => onError(e.message));
  }, []);
  useEffect(
    () => () => {
      recorder.current?.cancel();
      voice.stop();
      clearInterval(submitTimer.current);
    },
    [],
  );
  async function start() {
    setBusy(true);
    onError('');
    try {
      const next = await api('/sessions', 'POST', { consent, ...(category ? { category } : {}) });
      setS(next);
      setPhase(next.state);
      onUpdate(next);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function record() {
    if (timeUp) return;
    if (speech.provider() === 'groq' && !audioConsent) return;
    onError('');
    setMicError('');
    setRetryAudio(null);
    setInterim('');
    setMicStatus('Starting microphone…');
    try {
      recorder.current?.cancel();
      voice.stop();
      setPhase(transition(phase, 'RECORD'));
      recorder.current = speech.transcribeAudio({
        sessionId: s.id,
        onRetry: (retry) => setRetryAudio(() => retry),
        onText: (t, metadata) => {
          setTranscript((prev) => prev + t);
          if (Number.isFinite(metadata?.duration_seconds))
            setSpokenSeconds((prev) => (prev || 0) + metadata.duration_seconds);
        },
        onInterim: setInterim,
        onStatus: setMicStatus,
        onEnd: () => {
          setMicStatus('');
          setInterim('');
          setPhase((p) => (p === 'RECORDING' ? 'TRANSCRIPTION' : p));
        },
        onError: (m) => {
          setMicError(m);
        },
      });
    } catch (e) {
      setPhase('TRANSCRIPTION');
      setMicError(e.message);
    }
  }
  async function submit() {
    setBusy(true);
    onError('');
    setPhase(transition(phase, 'SUBMIT'));
    requestId.current ??= crypto.randomUUID();
    setSubmitElapsed(0);
    submitTimer.current = setInterval(() => setSubmitElapsed((s) => s + 1), 1000);
    try {
      let next,
        version = s.version;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          next = await api(`/sessions/${s.id}/answers`, 'POST', {
            request_id: requestId.current,
            version,
            transcript,
            spoken_seconds: spokenSeconds,
          });
          break;
        } catch (error) {
          if (error.status !== 409 || attempt === 3) throw error;
          const saved = await api(`/sessions/${s.id}`);
          if (saved.answers.some((a) => a.request_id === requestId.current)) {
            next = saved;
            break;
          }
          // Retry score-only version changes, never submit this answer to a different question.
          if (
            saved.index !== s.index ||
            saved.state !== s.state ||
            saved.pending_follow_up?.text !== s.pending_follow_up?.text
          )
            throw error;
          version = saved.version;
        }
      }
      setWarning(next.warning || '');
      recorder.current?.cancel();
      recorder.current = null;
      setRetryAudio(null);
      setMicError('');
      setS(next);
      setPhase(next.state);
      setTranscript('');
      setSpokenSeconds(null);
      requestId.current = null;
      onUpdate(next);
    } catch (e) {
      onError(e.message);
      setPhase('TRANSCRIPTION');
      if (e.status === 409) {
        try {
          const saved = await api(`/sessions/${s.id}`);
          setS(saved);
          setPhase(saved.state);
          // Keep the draft visible if another tab changed the interview.
          onError(
            'The saved interview changed. Your draft is preserved; check the current question before submitting again.',
          );
          requestId.current = null;
          onUpdate(saved);
        } catch {
          onError('Could not reload the saved attempt. Reconnect and open it from your Profile.');
        }
      }
    } finally {
      clearInterval(submitTimer.current);
      setBusy(false);
    }
  }
  if (!s)
    return (
      <>
        <Title
          eyebrow="PRACTICE INTERVIEW"
          title="A little preparation. A big difference."
          description="A guided conversation about your studies, finances and future plans."
        />
        {!rules?.enabled && <QuestionAngles />}
        <section className="card consent">
          <span className="empty-icon">
            <Mic size={30} />
          </span>
          <h2>Ready when you are.</h2>
          <label className="field">
            Practice focus
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Full interview</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="muted">
            Choose a weak category from your previous report to practise it. Category practice has
            its own score and is excluded from the leaderboard.
          </p>
          {rules?.enabled && !category ? (
            <p>
              19 questions: 7 majors, up to 9 linked cross-questions, and extras filling the
              remaining slots. Each major may have 0–3 cross-questions. Introduction comes first.
              Major answers should reach two minutes; early submission is allowed and flagged.
              Cross-answers should stay under one minute. Extra answers may be shorter when
              complete. Longer major/extra answers are allowed, with a 15-minute recording safety
              limit. Scoring runs in the background as answers are saved.
            </p>
          ) : (
            <p>
              You’ll answer the active questions in your consultancy’s question bank. Each main
              question gives you about two minutes. Answers save immediately; AI scoring runs after
              you finish, without live AI follow-up questions. Recording stops automatically when
              the time is up, and you can still review and edit your transcript before submitting.
            </p>
          )}
          <div className="info-grid">
            <div>
              <BookOpen />
              <b>Personal context</b>
              <p>Based on your saved study profile.</p>
            </div>
            <div>
              <ShieldCheck />
              <b>You’re in control</b>
              <p>Type, or choose to use your microphone.</p>
            </div>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I consent to this session’s audio transcript and answers being stored and reviewed by
              my assigned counsellor and administrators. If enabled, my profile and answers will be
              sent to the AI provider for evaluation.
            </span>
          </label>
          <p className="muted">
            Recordings are temporary. When Groq transcription is enabled, audio is sent to Groq
            after you stop recording; otherwise browser recognition may use your browser provider.
            GGEC does not save audio to its database. Transcripts are subject to the consultancy’s
            retention policy (default 90 days), except when held for review. Practice feedback does
            not predict an admission or visa decision.
          </p>
          {!profile && !staff ? (
            <Button onClick={onProfile}>
              Complete your profile first
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button disabled={!consent || busy} onClick={start}>
              {busy ? 'Starting…' : 'Begin interview'}
              <ArrowRight size={16} />
            </Button>
          )}
        </section>
      </>
    );
  if (s.state === 'REPORT' || s.state === 'EXPIRED' || staff)
    return (
      <Report
        session={s}
        staff={staff}
        onPractice={(category) => {
          setS(null);
          setCategory(category);
          setPhase('CONSENT');
          setConsent(false);
        }}
        onUpdate={(next) => {
          setS(next);
          setPhase(next.state);
          onUpdate(next);
        }}
        onHold={async () => {
          try {
            const next = await api(`/sessions/${s.id}/review-hold`, 'PUT', {
              review_hold: !s.review_hold,
            });
            setS(next);
          } catch (e) {
            onError(e.message);
          }
        }}
      />
    );
  const q = active;
  return (
    <>
      <Title
        eyebrow="YOUR PRACTICE SPACE"
        title="Take a breath. Tell your story."
        description="Use specific examples and your own words. Each question is timed, like a real interview."
      />
      {warning && <div className="alert">{warning}</div>}
      {timeUp && (
        <div className="alert" role="status">
          Time’s up for this question. Recording has stopped — review your answer and submit when
          you’re ready.
        </div>
      )}
      {s.answers.length > 0 && (
        <div className="alert" role="status">
          <b>
            Previous answer:{' '}
            {s.answers.at(-1).answer_score == null
              ? 'Not evaluated yet'
              : `${s.answers.at(-1).answer_score}/100`}
          </b>
          <p>
            {s.answers.at(-1).evaluation?.feedback ||
              'Your transcript is saved. A score appears only after successful evaluation.'}
          </p>
        </div>
      )}
      <div className="interview-layout">
        <section className="card interview">
          <div className="section-title">
            <span className="pill">
              {q.question_type
                ? q.question_type.toUpperCase()
                : s.pending_follow_up
                  ? 'FOLLOW-UP'
                  : 'MAIN QUESTION'}{' '}
              {s.index + 1} / {s.questions.length}
            </span>
            <div className="section-tools">
              {clock && (
                <span
                  className={`timer${timeUp ? ' over' : secondsLeft <= 15 ? ' urgent' : ''}`}
                  role="timer"
                >
                  <Clock size={15} />
                  {timeUp ? "Time's up" : `${clock}${flexible ? ' elapsed' : ''}`}
                </span>
              )}
              <button
                className="icon-button"
                aria-label="Read question aloud"
                title="Read question aloud"
                disabled={phase === 'RECORDING'}
                onClick={() => voice.speak(q.text)}
              >
                <Volume2 size={21} />
              </button>
            </div>
          </div>
          <div className="progress-track">
            <div style={{ width: `${(s.index / s.questions.length) * 100}%` }} />
          </div>
          <span className="eyebrow">{q.category}</span>
          <h2 className="question">{q.text}</h2>
          <label className="field">
            Your answer
            <textarea
              className="answer"
              placeholder="Speak or type your answer here. Review it before submitting."
              value={transcript}
              disabled={busy || phase === 'RECORDING'}
              onChange={(e) => {
                setTranscript(e.target.value);
                requestId.current = null;
                setPhase('TRANSCRIPTION');
              }}
              maxLength={12000}
            />
          </label>
          {interim && (
            <p className="alert" aria-live="polite">
              <b>Live transcript:</b> {interim}
            </p>
          )}
          {micError && (
            <div className="alert error" role="alert">
              {micError}
            </div>
          )}
          <div className="actions">
            {speech.provider() === 'groq' && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={audioConsent}
                  disabled={phase === 'RECORDING'}
                  onChange={(e) => setAudioConsent(e.target.checked)}
                />
                I agree to send my recording to Groq for transcription. Temporary audio is kept in
                this page for retry until submitted, replaced or closed.
              </label>
            )}
            {retryAudio && phase !== 'RECORDING' && (
              <Button
                secondary
                disabled={busy || !audioConsent}
                onClick={() => {
                  setMicError('');
                  setPhase('RECORDING');
                  void retryAudio();
                }}
              >
                Retry transcription
              </Button>
            )}
            {phase === 'RECORDING' ? (
              <Button
                secondary
                onClick={() => {
                  recorder.current?.stop();
                }}
              >
                <Square size={17} />
                {micStatus.startsWith('Transcribing') ? 'Transcribing…' : 'Stop recording'}
              </Button>
            ) : (
              <Button
                secondary
                disabled={
                  busy ||
                  !speech.supported() ||
                  timeUp ||
                  (speech.provider() === 'groq' && !audioConsent)
                }
                onClick={record}
              >
                <Mic size={17} />
                Use microphone
              </Button>
            )}
            <Button disabled={busy || phase === 'RECORDING' || !transcript.trim()} onClick={submit}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {`Evaluating… ${submitElapsed}s`}
                </>
              ) : (
                'Submit answer'
              )}
              {!busy && <ArrowRight size={17} />}
            </Button>
          </div>
          {busy && phase !== 'RECORDING' && (
            <p className="alert" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" /> The AI is reading and scoring your
              answer now — this can take up to a minute or two. Please don’t close this page.
            </p>
          )}
          <p role="status" className="muted">
            {phase === 'RECORDING'
              ? micStatus
              : busy
                ? ''
                : timeUp
                  ? 'Time is up for this question. Submit your answer when you’re ready.'
                  : !speech.supported()
                    ? 'Voice input is unavailable in this browser. You can type your answer.'
                    : 'Your transcript is saved when you submit. You can resume saved attempts from your Profile.'}
          </p>
        </section>
        <aside className="card tips">
          <h2>Make it your answer.</h2>
          <p>Explain your reason, support it with an example, and connect it to your plans.</p>
          <hr />
          <h3>Progress, not perfection</h3>
          <p>
            If you don’t know something, be honest. That’s a useful place to focus your next round
            of research.
          </p>
          <span className="pill">{s.answers.length} answers saved</span>
        </aside>
      </div>
    </>
  );
}
