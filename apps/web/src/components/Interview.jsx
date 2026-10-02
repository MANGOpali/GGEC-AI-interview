import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Clock,
  ClipboardList,
  Filter,
  Mic,
  ShieldCheck,
  Square,
  Volume2,
} from 'lucide-react';
import { api } from '../services/api';
import { speech, voice } from '../services/speech';
import { transition } from '../services/machine';
import { Button, Title } from './common';
import Report from './Report';

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
    sRef = useRef(initial),
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
  const [retryAudio, setRetryAudio] = useState(null);
  const [rules, setRules] = useState(null);
  const videoRef = useRef(null);
  const videoStream = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const [idChecked, setIdChecked] = useState(!!initial?.answers?.length);
  const [idStatus, setIdStatus] = useState('Getting the camera ready…');
  const idCanvas = useRef(null);
  const idBaseline = useRef(null);
  const idHits = useRef(0);
  // question_started_at is set server-side the moment the session is CREATED, before the
  // passport-check ritual even begins -- so the first question's countdown would otherwise
  // already show time elapsed by the time the student reaches it. Track when the check
  // actually finished and never start the displayed countdown earlier than that.
  const idCheckDoneAt = useRef(null);
  const [violationWarning, setViolationWarning] = useState('');
  const faceLandmarker = useRef(null);
  const violationCount = useRef(0);
  const awayStartedAt = useRef(null);
  const graceUntil = useRef(0);
  const endingRef = useRef(false);
  const MAX_VIOLATIONS = 3;
  const GRACE_MS = 4000;
  sRef.current = s;
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
    // Never start the displayed countdown before the passport-check screen actually finished --
    // question_started_at is set server-side at session creation, before that screen even shows.
    const started = Math.max(Date.parse(s.question_started_at), idCheckDoneAt.current ?? 0);
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
  }, [active?.text, s?.pending_follow_up, s?.question_started_at, s?.version, flexible, idChecked]);
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
      videoStream.current?.getTracks().forEach((t) => t.stop());
      videoStream.current = null;
    },
    [],
  );
  // Camera preview only: runs continuously through the whole live interview (like a real
  // video call), independent of recording. Never captured, uploaded or stored. Audio-only
  // recording/transcription for scoring is a separate getUserMedia call, untouched below.
  // The id-check screen and the main interview screen each mount their own <video> element
  // (only one at a time), so the stream must be re-attached whenever that node changes --
  // this callback ref does that on every mount instead of only once at acquisition time.
  const attachVideo = useCallback((el) => {
    videoRef.current = el;
    if (el && videoStream.current) el.srcObject = videoStream.current;
  }, []);
  const describeCameraError = (err) =>
    err?.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access in your browser, then reload the page.'
      : err?.name === 'NotFoundError'
        ? 'No camera was found on this device.'
        : err?.name === 'NotReadableError'
          ? 'Your camera is already in use by another app or browser tab. Close it and reload.'
          : 'Camera unavailable. You can still record audio.';
  function retryCamera() {
    if (videoStream.current) return;
    setCameraError('');
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 360 } }, audio: false })
      .then((stream) => {
        videoStream.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        console.error('Camera error:', err);
        setCameraError(describeCameraError(err));
      });
  }
  useEffect(() => {
    const live = s && s.state !== 'REPORT' && s.state !== 'EXPIRED';
    if (!live) {
      videoStream.current?.getTracks().forEach((t) => t.stop());
      videoStream.current = null;
      return;
    }
    if (videoStream.current) return;
    let cancelled = false;
    setCameraError('');
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 360 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoStream.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Camera error:', err);
        setCameraError(describeCameraError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [s?.state]);
  // Demo identity-check ritual only: this detects that SOMETHING now fills the guide frame
  // that didn't before (a luminance change in the cropped center region, sampled onto a tiny
  // offscreen canvas and discarded each tick) -- not real passport/document recognition, no
  // frames captured or stored. Auto-advance only runs while the camera is actually working;
  // on any camera error this pauses instead of silently sailing through as if a check happened.
  useEffect(() => {
    const live = s && s.state !== 'REPORT' && s.state !== 'EXPIRED';
    if (!live || idChecked || cameraError) return;
    voice.speak('Please show your passport to the camera.');
    setIdStatus('Getting the camera ready…');
    idBaseline.current = null;
    idHits.current = 0;
    const startedAt = Date.now();
    const WARMUP_MS = 1200; // let auto-exposure/focus settle before locking in a baseline
    const canvas = (idCanvas.current ??= document.createElement('canvas'));
    canvas.width = 32;
    canvas.height = 22;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const sample = () => {
      const video = videoRef.current;
      const vw = video?.videoWidth,
        vh = video?.videoHeight;
      if (!video || video.readyState < 2 || !vw || !vh) return null;
      const cw = vw * 0.62,
        ch = cw / 1.42;
      ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      return sum / (data.length / 4);
    };
    const tick = setInterval(() => {
      if (Date.now() - startedAt < WARMUP_MS) return;
      const value = sample();
      if (value == null) return;
      if (idBaseline.current == null) {
        idBaseline.current = value;
        setIdStatus('Hold your document steady in the frame…');
        return;
      }
      if (Math.abs(value - idBaseline.current) > 10) {
        idHits.current += 1;
        if (idHits.current >= 2) {
          clearInterval(tick);
          clearTimeout(reassure);
          setIdStatus('Got it! Continuing…');
          setTimeout(() => setIdChecked(true), 700);
        }
      } else {
        idHits.current = 0;
      }
    }, 400);
    const reassure = setTimeout(
      () => setIdStatus("Still scanning — you can continue manually whenever you're ready."),
      30000,
    );
    return () => {
      clearInterval(tick);
      clearTimeout(reassure);
    };
  }, [idChecked, cameraError, s?.state]);
  useEffect(() => {
    if (idChecked) idCheckDoneAt.current = Date.now();
  }, [idChecked]);
  // Anti-cheat: head-pose + face-presence heuristic (not literal eye-gaze tracking, and not
  // identity verification) using a real face-landmark model. Detects the student's face turning
  // away from -- or disappearing from -- the frame for a sustained period, warns first, and only
  // ends the interview after repeated violations. Frames are processed in-memory for this check
  // only; nothing is captured, uploaded or stored. Runs only during live question-answering, once
  // the ID-check ritual is done, reusing the camera stream that's already active.
  useEffect(() => {
    if (!idChecked || cameraError || !active) return;
    let cancelled = false;
    violationCount.current = 0;
    awayStartedAt.current = null;
    graceUntil.current = 0;
    import('@mediapipe/tasks-vision')
      .then(async ({ FaceLandmarker, FilesetResolver }) => {
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
        );
        if (cancelled) return;
        faceLandmarker.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU',
          },
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      })
      .catch((err) => {
        // No monitoring is safer than blocking the interview if the model/CDN is unreachable.
        console.error('Anti-cheat model failed to load:', err);
      });
    const YAW_THRESHOLD_DEG = 28;
    const SUSTAINED_MS = 2500;
    const tick = setInterval(() => {
      const fl = faceLandmarker.current;
      const video = videoRef.current;
      if (!fl || !video || video.readyState < 2 || !video.videoWidth) return;
      let result;
      try {
        result = fl.detectForVideo(video, performance.now());
      } catch {
        return;
      }
      const face = result.faceLandmarks?.[0];
      let away = !face;
      if (face && result.facialTransformationMatrixes?.[0]) {
        const m = result.facialTransformationMatrixes[0].data;
        // Angle of the face's forward axis in the horizontal plane, relative to the camera --
        // convention-tolerant proxy for yaw: grows as the head turns left/right regardless of
        // the matrix's exact reference orientation.
        const yawDeg = (Math.atan2(m[2], m[10]) * 180) / Math.PI;
        away = Math.abs(yawDeg) > YAW_THRESHOLD_DEG;
      }
      const now = Date.now();
      if (now < graceUntil.current) return;
      if (away) {
        if (!awayStartedAt.current) awayStartedAt.current = now;
        else if (now - awayStartedAt.current > SUSTAINED_MS) {
          awayStartedAt.current = null;
          registerViolation('camera');
        }
      } else {
        awayStartedAt.current = null;
        if (now >= graceUntil.current) setViolationWarning('');
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(tick);
      faceLandmarker.current?.close();
      faceLandmarker.current = null;
    };
  }, [idChecked, cameraError, !!active]);
  // Tab-switch / window-blur detection: the camera heuristic above only notices a face turning
  // away, not a student alt-tabbing to look something up in another app/window. Reuses the same
  // violation-escalation path (registerViolation) rather than a parallel system. A brief,
  // accidental switch doesn't count -- only a sustained one does.
  useEffect(() => {
    if (!idChecked || cameraError || !active) return;
    const AWAY_MS = 3000;
    let hiddenSince = null;
    const check = () => {
      const now = Date.now();
      if (now < graceUntil.current) {
        hiddenSince = null;
        return;
      }
      const away = document.hidden || !document.hasFocus();
      if (away) {
        if (!hiddenSince) hiddenSince = now;
        else if (now - hiddenSince > AWAY_MS) {
          hiddenSince = null;
          registerViolation('tab');
        }
      } else {
        hiddenSince = null;
      }
    };
    const tick = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('blur', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('blur', check);
      window.removeEventListener('focus', check);
    };
  }, [idChecked, cameraError, !!active]);
  function registerViolation(reason) {
    violationCount.current += 1;
    graceUntil.current = Date.now() + GRACE_MS;
    if (violationCount.current >= MAX_VIOLATIONS) {
      setViolationWarning('');
      endForViolation();
    } else {
      voice.speak(reason === 'tab' ? 'Please stay on this tab and face the camera.' : 'Please face the camera.');
      setViolationWarning(
        `${reason === 'tab' ? 'Please stay on this interview tab.' : 'Please face the camera and keep it in view.'} Warning ${violationCount.current} of ${MAX_VIOLATIONS}.`,
      );
    }
  }
  async function endForViolation() {
    if (!sRef.current || endingRef.current) return;
    endingRef.current = true;
    recorder.current?.cancel();
    recorder.current = null;
    try {
      const next = await api(`/sessions/${sRef.current.id}/end-early`, 'POST', {
        version: sRef.current.version,
        reason: 'anti_cheat_violation',
      });
      setS(next);
      setPhase(next.state);
      onUpdate(next);
    } catch (e) {
      onError(e.message);
    } finally {
      endingRef.current = false;
    }
  }
  async function start() {
    setBusy(true);
    onError('');
    try {
      const next = await api('/sessions', 'POST', { consent, ...(category ? { category } : {}) });
      setS(next);
      setPhase(next.state);
      setIdChecked(false);
      setIdStatus('Getting the camera ready…');
      setViolationWarning('');
      idCheckDoneAt.current = null;
      onUpdate(next);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function record() {
    if (timeUp) return;
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
        <section className="card consent">
          <span className="empty-icon">
            <Mic size={30} />
          </span>
          <h2>Ready when you are.</h2>
          <label className="field practice-focus">
            <span className="field-label-row">
              <Filter size={14} /> Practice focus
            </span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Full interview</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <small className="field-hint">
              {category
                ? 'Focused practice on this category only — scored separately, not on the leaderboard.'
                : 'Choose a weak category from a past report to focus on, or keep Full interview.'}
            </small>
          </label>
          <div className="info-grid">
            <div>
              <ClipboardList />
              <b>{rules?.enabled && !category ? '19 guided questions' : 'Guided practice questions'}</b>
              <p>
                {rules?.enabled && !category
                  ? 'Majors, cross-questions and extras, paced like the real interview.'
                  : "Your consultancy's question bank, scored after you finish."}
              </p>
            </div>
            <div>
              <BookOpen />
              <b>Personal context</b>
              <p>Based on your saved study profile.</p>
            </div>
            <div>
              <ShieldCheck />
              <b>Video, like the real thing</b>
              <p>Speak on camera, just like a real Pre-CAS interview.</p>
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
            Recordings are temporary and never saved to GGEC's database; audio is sent to our
            transcription provider or your browser only for transcription. Transcripts follow your consultancy's retention
            policy (default 90 days). This is practice feedback, not an admission or visa decision.
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
  if (!idChecked)
    return (
      <>
        <Title
          eyebrow="IDENTITY CHECK"
          title="Show your passport to the camera"
          description="Just like the real Pre-CAS interview — this is a practice run only."
        />
        <section className="card id-check">
          <div className="camera-tile camera-tile-large id-check-camera">
            <video ref={attachVideo} autoPlay muted playsInline />
            <div className="id-check-frame" />
            {cameraError && <p className="camera-tile-error">{cameraError}</p>}
          </div>
          <p className="muted">
            {cameraError
              ? "We couldn't access a camera on this device, so this practice step will be skipped. The rest of the interview still works normally — you'll answer by voice recording."
              : "Hold your passport's photo page (or any ID) steadily inside the frame. Nothing is captured, analyzed or stored — this simply mirrors what the real interview will ask you to do."}
          </p>
          {!cameraError && (
            <p className="id-check-status">
              <span className="id-check-status-dot" aria-hidden="true" />
              {idStatus}
            </p>
          )}
          <div className="actions" style={{ justifyContent: 'center' }}>
            {cameraError && (
              <Button secondary onClick={retryCamera}>
                Retry camera
              </Button>
            )}
            <Button onClick={() => setIdChecked(true)}>
              Continue to interview
              <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      </>
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
          <div className="camera-tile camera-tile-xl">
            <video ref={attachVideo} autoPlay muted playsInline />
            {cameraError && <p className="camera-tile-error">{cameraError}</p>}
            <span className="camera-tile-label">Camera preview only — never recorded or stored</span>
            {phase === 'RECORDING' && (
              <span className="camera-tile-rec">
                <span className="camera-tile-rec-dot" aria-hidden="true" />
                Recording
              </span>
            )}
          </div>
          {violationWarning && (
            <div className="violation-banner" role="alert">
              <AlertTriangle size={22} aria-hidden="true" />
              {violationWarning}
            </div>
          )}
          {micError && (
            <div className="alert error" role="alert">
              {micError}
            </div>
          )}
          <div className="actions">
            {retryAudio && phase !== 'RECORDING' && (
              <Button
                secondary
                disabled={busy}
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
                disabled={busy || !speech.supported() || timeUp}
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
                    ? 'Voice recording is unavailable in this browser. Try Chrome, Edge or Safari.'
                    : 'Your answer is saved when you submit. You can resume saved attempts from your Profile.'}
          </p>
        </section>
      </div>
    </>
  );
}
