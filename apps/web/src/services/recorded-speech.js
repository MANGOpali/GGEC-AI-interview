// Audio stays in browser memory for retry; cancel/discard releases it. No local storage.
export function createRecordedSpeech(upload, getBrowser = () => globalThis) {
  return {
    supported() {
      const b = getBrowser();
      return !!(b.navigator?.mediaDevices?.getUserMedia && b.MediaRecorder);
    },
    transcribeAudio({
      sessionId,
      onText,
      onEnd,
      onError,
      onStatus = () => {},
      onRetry = () => {},
    }) {
      const b = getBrowser();
      let stream, recorder, blob, controller, timer, watchdog;
      let cancelled = false,
        stopped = false,
        uploading = false,
        bytes = 0,
        chunks = [];
      const release = () => {
        stream?.getTracks().forEach((t) => t.stop());
        clearTimeout(timer);
        clearTimeout(watchdog);
      };
      const end = () => {
        if (!cancelled) onEnd();
      };
      const send = async () => {
        if (cancelled || uploading || !blob) return;
        uploading = true;
        onRetry(null);
        onStatus('Transcribing your recording… Please wait.');
        controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 100000);
        try {
          const result = await upload(blob, sessionId, controller.signal);
          if (cancelled) return;
          onText(result.text + ' ',result);
          blob = null;
        } catch (e) {
          if (!cancelled) {
            onError(
              e.name === 'AbortError'
                ? 'Transcription timed out. Retry or type your answer.'
                : e.message,
            );
            onRetry(send);
          }
        } finally {
          clearTimeout(timeout);
          uploading = false;
          end();
        }
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        if (recorder?.state === 'recording') {
          recorder.stop();
          release();
          watchdog = setTimeout(() => {
            if (!cancelled && !uploading && !blob) {
              onError('Recording could not finish. Record again or type your answer.');
              end();
            }
          }, 5000);
        }
      };
      const cancel = () => {
        cancelled = true;
        stopped = true;
        controller?.abort();
        if (recorder?.state === 'recording') recorder.stop();
        release();
        blob = null;
        chunks = [];
      };
      void (async () => {
        try {
          stream = await b.navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false,
          });
          if (cancelled || stopped) {
            release();
            end();
            return;
          }
          const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) =>
            b.MediaRecorder.isTypeSupported(t),
          );
          if (!type)
            throw new Error(
              'Audio recording is unsupported in this browser. Please type your answer.',
            );
          recorder = new b.MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 64000 });
          recorder.ondataavailable = (e) => {
            if (cancelled || !e.data.size) return;
            bytes += e.data.size;
            if (bytes > 8 * 1024 * 1024) {
              cancel();
              onError('Recording is too large. Record a shorter answer.');
              onEnd();
              return;
            }
            chunks.push(e.data);
          };
          recorder.onerror = () => {
            cancel();
            onError('Microphone recording failed. Record again or type your answer.');
            onEnd();
          };
          recorder.onstop = () => {
            release();
            if (cancelled) return;
            blob = new Blob(chunks, { type: recorder.mimeType });
            chunks = [];
            if (!blob.size) {
              blob = null;
              onError('No audio was recorded. Please try again.');
              end();
              return;
            }
            void send();
          };
          recorder.start(1000);
          onStatus('Recording… Your text will appear after you press Stop.');
          timer = setTimeout(stop, 900000);
        } catch (e) {
          release();
          if (!cancelled) {
            onError(
              e.name === 'NotAllowedError'
                ? 'Microphone permission was denied. Allow access or type your answer.'
                : e.message,
            );
            end();
          }
        }
      })();
      return { stop, cancel };
    },
  };
}
