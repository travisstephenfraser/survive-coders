// The microphone on a keyboard, opened once for the two things that need it: the recognizer
// (voice.js feeds it this stream's track, which keeps a session alive through the quiet between
// commands, where Chrome's own mic path ends one after 8 to 15 seconds) and the level (the
// Shoutr Flow light, the mic check's meter). Closing it ends the track, so the browser's own
// "mic in use" mark goes out whenever the game is not listening.
let stream = null;
let context = null;
let source = null;
let analyser = null;
let samples = null;
let opening = null;
let floor = 0.003; // the room's own level, followed slowly

const REASONS = { NotAllowedError: 'blocked', SecurityError: 'blocked', NotFoundError: 'none', OverconstrainedError: 'none' };
const threshold = () => Math.max(0.012, floor * 4);

export const mic = {
  // { ok: true }, or { ok: false, reason }: 'blocked' (refused), 'none' (no input device) or
  // 'failed'. The recognizer cannot tell the first two apart (both are its `not-allowed`), which
  // is why the reason comes from here.
  async open() {
    if (mic.track()?.readyState === 'live') return { ok: true };
    opening ??= (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        context ??= new AudioContext();
        context.resume();
        source = context.createMediaStreamSource(stream);
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        samples = new Float32Array(analyser.fftSize);
        source.connect(analyser);
        return { ok: true };
      } catch (err) {
        mic.close(); // the stream may have opened before something after it threw
        return { ok: false, reason: REASONS[err?.name] ?? 'failed' };
      } finally {
        opening = null;
      }
    })();
    return opening;
  },

  track: () => stream?.getAudioTracks()[0] ?? null,

  // The level right now (0 with the mic closed). Each reading also moves the room's level: fast
  // toward a quiet reading, very slowly toward a loud one, so a sentence stays a voice from its
  // first word to its last, and a room that is simply noisy stops reading as one in a minute.
  level() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const rms = Math.sqrt(sum / samples.length);
    floor += (rms - floor) * (rms > threshold() ? 0.0002 : 0.05);
    return rms;
  },

  speaking: () => mic.level() > threshold(),

  close() {
    for (const t of stream?.getTracks() ?? []) t.stop();
    source?.disconnect();
    stream = source = analyser = null;
  },
};
