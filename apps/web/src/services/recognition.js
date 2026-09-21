// Inject the browser and timers to test recognition without accessing a microphone.
export function createSpeechService(getBrowser = () => globalThis, timers = globalThis) {
  return {
    supported() {
      const b = getBrowser();
      return !!(b.SpeechRecognition || b.webkitSpeechRecognition);
    },
    transcribeAudio({ onText, onEnd, onError, onInterim = () => {}, onStatus = () => {} }) {
      const b = getBrowser(),
        Engine = b.SpeechRecognition || b.webkitSpeechRecognition;
      if (!Engine)
        throw new Error(
          'Speech recognition is unavailable here. Open this page in Chrome or Edge, or type your answer.',
        );
      let recognition,
        retryTimer,
        watchdog,
        silenceTimer,
        stopped = false,
        finished = false;
      let emptyEnds = 0,
        heardText = false,
        interim = '';
      const clearTimers = () => {
        timers.clearTimeout(retryTimer);
        timers.clearTimeout(watchdog);
        timers.clearTimeout(silenceTimer);
      };
      function detach() {
        if (recognition)
          recognition.onstart =
            recognition.onaudiostart =
            recognition.onresult =
            recognition.onend =
            recognition.onerror =
              null;
      }
      function flushInterim() {
        if (interim.trim()) onText(interim.trim() + ' ');
        interim = '';
        onInterim('');
      }
      function finish(message, cancelled = false) {
        if (finished) return;
        finished = true;
        clearTimers();
        detach();
        try {
          recognition?.abort();
        } catch {
          /* Engine may already be closed. */
        }
        if (cancelled) return;
        flushInterim();
        if (message) onError(message);
        onEnd();
      }
      function startEngine() {
        if (finished || stopped) return;
        heardText = false;
        recognition = new Engine();
        const r = recognition;
        r.lang = 'en-GB';
        r.continuous = true;
        r.interimResults = true;
        onStatus('Starting microphone… Allow microphone access if your browser asks.');
        watchdog = timers.setTimeout(
          () =>
            finish(
              'The speech service did not start. Open this page in Chrome or Edge, allow microphone access, and try again. You can also type your answer.',
            ),
          10000,
        );
        r.onstart = r.onaudiostart = () => {
          if (stopped || finished) return;
          timers.clearTimeout(watchdog);
          onStatus('Listening… Speak naturally. Your words will appear below.');
          timers.clearTimeout(silenceTimer);
          silenceTimer = timers.setTimeout(() => {
            if (!finished && !stopped && !heardText)
              onStatus(
                'No words received yet. Check your microphone input. You can stop and try Chrome or Edge, or type your answer.',
              );
          }, 15000);
        };
        r.onresult = (event) => {
          if (finished) return;
          let finalText = '';
          interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
          }
          for (let i = 0; i < event.results.length; i++) {
            if (!event.results[i].isFinal) interim += event.results[i][0].transcript + ' ';
          }
          if (finalText.trim() || interim.trim()) {
            timers.clearTimeout(silenceTimer);
            heardText = true;
            emptyEnds = 0;
          }
          if (finalText) onText(finalText);
          onInterim(interim);
        };
        r.onerror = (event) => {
          if (finished || stopped) return;
          if (event.error === 'no-speech') return;
          const messages = {
            'not-allowed':
              'Microphone access was blocked. Allow this site to use your microphone in the browser’s site permissions, then try again.',
            'service-not-allowed':
              'This browser cannot use its speech-recognition service. Open this page in Chrome or Edge and allow microphone access.',
            'audio-capture':
              'No working microphone was found. Check your Windows input device and microphone permissions, then try again.',
            network:
              'The browser could not connect to its speech-recognition service. Check your connection. If you are using the in-app preview, try this page in Chrome or Edge.',
            aborted:
              'Speech recognition was interrupted by the browser. Try again when the microphone is available.',
            'language-not-supported':
              'This browser’s speech service does not support the interview language. Try Chrome or Edge, or type your answer.',
          };
          finish(
            messages[event.error] ||
              `Speech recognition failed (${event.error || 'unknown error'}). You can retry or type your answer.`,
          );
        };
        r.onend = () => {
          if (finished) return;
          timers.clearTimeout(watchdog);
          timers.clearTimeout(silenceTimer);
          if (stopped) return finish();
          flushInterim();
          detach();
          if (!heardText) emptyEnds++;
          if (emptyEnds >= 3)
            return finish(
              'The speech service keeps stopping without returning any words. Check your microphone and permissions. If you are in the in-app preview, open this page in Chrome or Edge.',
            );
          onStatus('Reconnecting the speech service… You can stop at any time.');
          retryTimer = timers.setTimeout(startEngine, 400);
        };
        try {
          r.start();
        } catch {
          finish(
            'The browser could not start speech recognition. Check microphone permissions, or open this page in Chrome or Edge.',
          );
        }
      }
      // Return a handle before callbacks can fire, including synchronous startup failures.
      retryTimer = timers.setTimeout(startEngine, 0);
      return {
        stop() {
          if (finished || stopped) return;
          stopped = true;
          clearTimers();
          onStatus('Finishing transcript…');
          watchdog = timers.setTimeout(() => finish(), 1500);
          try {
            recognition ? recognition.stop() : finish();
          } catch {
            finish();
          }
        },
        cancel() {
          finish(null, true);
        },
      };
    },
  };
}
export const speech = createSpeechService();
