import { speech as browserSpeech } from './recognition.js';
import { createRecordedSpeech } from './recorded-speech.js';
import { api, getSpeechProvider } from './api.js';
const groqSpeech = createRecordedSpeech((blob, sessionId, signal) =>
  api(`/sessions/${sessionId}/transcribe`, 'POST', blob, { signal }),
);
export const speech = {
  provider: getSpeechProvider,
  supported: () => (getSpeechProvider() === 'groq' ? groqSpeech : browserSpeech).supported(),
  transcribeAudio: (options) =>
    (getSpeechProvider() === 'groq' ? groqSpeech : browserSpeech).transcribeAudio(options),
};

// TTS interface, replace implementation to change provider.
export const voice = {
  speak(text) {
    if (!window.speechSynthesis) return;
    this.stop();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    window.speechSynthesis.speak(u);
  },
  stop() {
    window.speechSynthesis?.cancel();
  },
};
