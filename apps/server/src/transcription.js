export function createTranscriber(env = process.env) {
  if (env.STT_PROVIDER !== 'groq') return null;
  if (!env.GROQ_API_KEY) throw new Error('Groq speech requires GROQ_API_KEY.');
  const model = env.GROQ_STT_MODEL || 'whisper-large-v3';
  if (!['whisper-large-v3', 'whisper-large-v3-turbo'].includes(model))
    throw new Error('Unsupported speech model.');
  return {
    name: 'groq',
    async transcribeAudio(bytes, type) {
      const form = new FormData();
      const extension = {
        'audio/webm': 'webm',
        'audio/mp4': 'mp4',
        'audio/ogg': 'ogg',
        'audio/wav': 'wav',
      }[type];
      form.set('file', new Blob([bytes], { type }), `answer.${extension}`);
      form.set('model', model);
      form.set('language', 'en');
      form.set('response_format', 'verbose_json');
      form.set('temperature', '0');
      let response;
      try {
        response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
          body: form,
          signal: AbortSignal.timeout(90000),
        });
      } catch {
        throw Object.assign(
          new Error(
            'Transcription could not connect or timed out. Retry the recording or type your answer.',
          ),
          { status: 503 },
        );
      }
      if (!response.ok) {
        const message =
          response.status === 429
            ? 'Speech usage limit reached. Wait before retrying, or type your answer.'
            : 'Speech service is unavailable. Retry later or type your answer.';
        throw Object.assign(new Error(message), { status: response.status === 429 ? 429 : 503 });
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw Object.assign(new Error('Invalid speech response. Please retry.'), { status: 502 });
      }
      if (typeof data.text !== 'string' || data.text.length > 12000 || !data.text.trim())
        throw Object.assign(
          new Error('No usable speech was recognised. Record again or type your answer.'),
          { status: 422 },
        );
      if (typeof data.duration === 'number' && data.duration > 905)
        throw Object.assign(new Error('Recording is too long. Maximum 15 minutes.'), {
          status: 422,
        });
      return { text: data.text.trim(), duration_seconds: Number.isFinite(data.duration) && data.duration>=0 ? data.duration : null };
    },
  };
}
export function validAudio(bytes, type) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16) return false;
  if (type === 'audio/webm')
    return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (type === 'audio/mp4') return bytes.toString('ascii', 4, 8) === 'ftyp';
  if (type === 'audio/ogg') return bytes.toString('ascii', 0, 4) === 'OggS';
  if (type === 'audio/wav')
    return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  return false;
}
