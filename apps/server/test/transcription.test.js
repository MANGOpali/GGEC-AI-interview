import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriber, validAudio } from '../src/transcription.js';
import { createRecordedSpeech } from '../../web/src/services/recorded-speech.js';

test('Groq transcription sends audio only with configured model and rejects provider text leakage', async (t) => {
  const service = createTranscriber({ STT_PROVIDER: 'groq', GROQ_API_KEY: 'fake' });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/audio/transcriptions');
    assert.equal(options.body.get('model'), 'whisper-large-v3');
    assert.equal(options.body.get('language'), 'en');
    assert.equal(options.body.get('prompt'), null);
    assert.equal(options.headers.Authorization, 'Bearer fake');
    return { ok: true, json: async () => ({ text: ' My spoken answer ', duration: 5 }) };
  });
  assert.deepEqual(await service.transcribeAudio(Buffer.alloc(20), 'audio/webm'), {
    text: 'My spoken answer',
    duration_seconds:5,
  });
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ message: 'SECRET' }),
  });
  await assert.rejects(
    service.transcribeAudio(Buffer.alloc(20), 'audio/webm'),
    (e) => !e.message.includes('SECRET') && e.status === 503,
  );
  assert.equal(validAudio(Buffer.from('not audio'), 'audio/webm'), false);
  assert.throws(() => createTranscriber({ STT_PROVIDER: 'groq' }), /GROQ_API_KEY/);
});
function browserFixture() {
  let stopped = 0;
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    constructor(stream, options) {
      this.mimeType = options.mimeType;
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable({ data: new Blob(['fictional audio']) });
        this.onstop();
      });
    }
  }
  return {
    b: {
      MediaRecorder: Recorder,
      navigator: {
        mediaDevices: {
          getUserMedia: async () => ({
            getTracks: () => [
              {
                stop() {
                  stopped++;
                },
              },
            ],
          }),
        },
      },
    },
    stops: () => stopped,
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
test('recorded speech stops microphone, retains failed upload for retry and emits text once', async () => {
  const fixture = browserFixture();
  let calls = 0,
    retry,
    text = '',
    ends = 0;
  const service = createRecordedSpeech(
    async () => {
      if (++calls === 1) throw new Error('offline');
      return { text: 'Hello' };
    },
    () => fixture.b,
  );
  const r = service.transcribeAudio({
    sessionId: 'fixture',
    onText: (t) => (text += t),
    onError: () => {},
    onEnd: () => ends++,
    onRetry: (r) => (retry = r),
  });
  await tick();
  r.stop();
  await tick();
  assert.equal(calls, 1);
  assert.equal(typeof retry, 'function');
  assert(fixture.stops() > 0);
  await retry();
  assert.equal(text, 'Hello ');
  assert.equal(ends, 2);
  assert.equal(retry, null);
  r.cancel();
});
test('cancel during microphone permission prevents recording and upload', async () => {
  const fixture = browserFixture();
  let release,
    calls = 0;
  const original = fixture.b.navigator.mediaDevices.getUserMedia;
  fixture.b.navigator.mediaDevices.getUserMedia = () => new Promise((r) => (release = r));
  const service = createRecordedSpeech(
    async () => {
      calls++;
    },
    () => fixture.b,
  );
  const r = service.transcribeAudio({
    onText: () => assert.fail(),
    onEnd: () => assert.fail(),
    onError: () => assert.fail(),
  });
  r.cancel();
  release(await original());
  await tick();
  assert.equal(calls, 0);
  assert(fixture.stops() > 0);
});
