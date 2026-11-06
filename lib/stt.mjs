// Speech to text for Telegram voice notes, with ElevenLabs Scribe (the same ElevenLabs key as the voice
// agent). The language is detected automatically. Kazakh is sometimes taken for a close language (Kyrgyz,
// Tatar…), which drops letters like ғ and қ: anything other than English, Russian or Kazakh is therefore
// transcribed again as Kazakh. The audio is sent for transcription only and never stored.
export const hasStt = () => Boolean(process.env.ELEVENLABS_API_KEY);

async function scribe(buf, filename, type, languageCode) {
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('tag_audio_events', 'false');
  if (languageCode) form.append('language_code', languageCode);
  form.append('file', new Blob([buf], { type }), filename);
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, body: form, signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`speech-to-text failed (${res.status})`);
  const j = await res.json();
  return { text: String(j.text || '').trim(), language: j.language_code || null };
}

export async function transcribe(buf, { filename = 'voice.ogg', type = 'audio/ogg' } = {}) {
  const first = await scribe(buf, filename, type);
  if (!first.text || ['eng', 'rus', 'kaz', 'en', 'ru', 'kk'].includes(first.language)) return first;
  return scribe(buf, filename, type, 'kaz');
}
