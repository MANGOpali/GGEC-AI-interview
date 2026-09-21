import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechService } from '../../web/src/services/recognition.js';

function fixture() {
  const instances = [],
    tasks = new Map(),
    text = [],
    errors = [],
    statuses = [],
    interim = [];
  let id = 0,
    ended = 0;
  const timers = {
    setTimeout(fn, delay) {
      tasks.set(++id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
  };
  function tick(delay) {
    const next = [...tasks].find(([, job]) => job.delay === delay);
    assert(next, `Expected a ${delay}ms timer`);
    tasks.delete(next[0]);
    next[1].fn();
  }
  class Engine {
    constructor() {
      instances.push(this);
    }
    start() {}
    stop() {
      this.stopped = true;
    }
    abort() {
      this.aborted = true;
    }
    result(value, final = true) {
      const result = [{ transcript: value }];
      result.isFinal = final;
      this.onresult({ resultIndex: 0, results: [result] });
    }
  }
  const service = createSpeechService(() => ({ SpeechRecognition: Engine }), timers);
  const handle = service.transcribeAudio({
    onText: (t) => text.push(t),
    onError: (e) => errors.push(e),
    onEnd: () => ended++,
    onInterim: (t) => interim.push(t),
    onStatus: (s) => statuses.push(s),
  });
  tick(0);
  return {
    instances,
    handle,
    text,
    errors,
    statuses,
    interim,
    tick,
    tasks,
    get ended() {
      return ended;
    },
  };
}
test('speech reconnects after natural disconnect and preserves results', () => {
  const f = fixture(),
    first = f.instances[0];
  first.onstart();
  first.result('My university');
  first.onend();
  assert.equal(f.ended, 0);
  f.tick(400);
  assert.equal(f.instances.length, 2);
  const second = f.instances[1];
  second.onstart();
  second.result('has a relevant course');
  f.handle.stop();
  second.onend();
  assert.equal(f.ended, 1);
  assert.equal(f.tasks.size, 0);
  assert.equal(f.text.join(''), 'My university has a relevant course ');
});
test('speech bounds repeated empty disconnects instead of looping forever', () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    f.instances[i].onstart();
    f.instances[i].onerror({ error: 'no-speech' });
    f.instances[i].onend();
    if (i < 2) f.tick(400);
  }
  assert.equal(f.ended, 1);
  assert.equal(f.tasks.size, 0);
  assert.match(f.errors[0], /keeps stopping/);
});
test('speech permission and network errors finish with actionable feedback', () => {
  for (const code of ['not-allowed', 'network', 'audio-capture', 'service-not-allowed']) {
    const f = fixture();
    f.instances[0].onerror({ error: code });
    assert.equal(f.ended, 1);
    assert.equal(f.tasks.size, 0);
    assert(f.errors[0].length > 30);
    assert(f.instances[0].aborted);
  }
});
test('speech stop watchdog preserves last interim words if engine never ends', () => {
  const f = fixture(),
    r = f.instances[0];
  r.onstart();
  r.result('unfinished sentence', false);
  assert.deepEqual(f.text, []);
  f.handle.stop();
  f.tick(1500);
  assert.deepEqual(f.text, ['unfinished sentence ']);
  assert.equal(f.ended, 1);
  assert(r.aborted);
});
test('speech interim replacement and final results do not duplicate words', () => {
  const f = fixture(),
    r = f.instances[0];
  r.onstart();
  r.result('my', false);
  r.result('my course', false);
  r.result('my course', true);
  f.handle.stop();
  r.onend();
  assert.deepEqual(f.text, ['my course ']);
});
test('speech startup timeout and cancellation release microphone and timers', () => {
  const f = fixture();
  f.tick(10000);
  assert.match(f.errors[0], /did not start/);
  assert.equal(f.ended, 1);
  const other = fixture();
  other.instances[0].onstart();
  other.instances[0].onend();
  other.handle.cancel();
  assert.equal(other.tasks.size, 0);
  assert.equal(other.ended, 0);
  assert.equal(other.instances[0].onresult, null);
});

test('silent running engine offers guidance without discarding text or forcing a stop', () => {
  const f = fixture(),
    r = f.instances[0];
  r.onstart();
  f.tick(15000);
  assert.match(f.statuses.at(-1), /No words received/);
  assert.equal(f.ended, 0);
  r.result('Words arrived later');
  f.handle.stop();
  r.onend();
  assert.equal(f.text.join(''), 'Words arrived later ');
  assert.equal(f.tasks.size, 0);
});

test('stop during reconnection prevents engine restart and keeps earlier words', () => {
  const f = fixture(),
    r = f.instances[0];
  r.onstart();
  r.result('Saved words');
  r.onend();
  f.handle.stop();
  f.tick(1500);
  assert.equal(f.instances.length, 1);
  assert.equal(f.text.join(''), 'Saved words ');
  assert.equal(f.ended, 1);
  assert.equal(f.tasks.size, 0);
});
