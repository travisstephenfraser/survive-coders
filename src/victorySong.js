// The ending's victory song: an original chiptune stored as MIDI note numbers and played on a
// small NES-style WebAudio synth (two pulse voices, triangle bass, noise drums). A three-bar
// fanfare (I, bVI-bVII, I) lands on a 16-bar theme that loops until the scene ends. No audio
// file: it plays through Phaser's master mute node, so muting (N) still applies.

const BPM = 150;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const BAR = 16;
const MASTER = 0.28; // RMS -27.4 dB, level with the level music at its 0.28 volume (-27.9 dB)

// Scientific pitch name to MIDI note number: 'C4' 60, 'Ab5' 80.
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const [, letter, acc, oct] = /^([A-G])([#b]?)(\d)$/.exec(name);
  return 12 * (Number(oct) + 1) + PITCH[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
}
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// One bar per string: 'note:16ths', 'r' rests. Drums use K kick, S snare, H hat, C crash.
const LEAD = [
  // Fanfare
  'G4:1 C5:1 E5:1 G5:1 C6:3 G5:1 C6:4 r:2 C6:1 C6:1',
  'Ab5:6 C6:2 Bb5:6 D6:2',
  'C6:12 r:4',
  // Theme
  'G5:2 A5:2 G5:4 E5:2 G5:2 C6:4',
  'B5:2 C6:2 B5:4 G5:2 B5:2 D6:4',
  'C6:2 D6:2 C6:4 A5:2 C6:2 E6:4',
  'F6:4 E6:2 D6:2 D6:4 B5:4',
  'G5:2 A5:2 G5:4 E5:2 G5:2 C6:4',
  'B5:2 C6:2 B5:4 G5:2 B5:2 D6:4',
  'A5:2 C6:2 F6:4 D6:4 B5:2 D6:2',
  'C6:6 G5:2 E5:2 G5:2 C6:4',
  'A5:4 G5:2 F5:2 A5:4 C6:4',
  'B5:4 A5:2 G5:2 B5:4 D6:4',
  'G5:2 B5:2 E6:4 D6:2 B5:2 G5:4',
  'A5:2 C6:2 E6:4 D6:2 C6:2 A5:4',
  'F5:2 A5:2 C6:4 A5:2 C6:2 F6:4',
  'G5:2 B5:2 D6:4 G6:4 D6:4',
  'Ab5:2 C6:2 Eb6:4 Bb5:2 D6:2 F6:4',
  'G6:8 E6:2 C6:2 G5:2 E5:2',
];
const FANFARE_BARS = 3;

// Two chords per bar (half-bar each). Harmony and bass are generated from these.
const CHORDS = ['C C', 'Ab Bb', 'C C', 'C C', 'G G', 'Am Am', 'F G', 'C C', 'G G', 'F G', 'C C', 'F F', 'G G', 'Em Em', 'Am Am', 'F F', 'G G', 'Ab Bb', 'C C'];
// Bass root (octave 2) and the two tones the off-beat comp alternates between (octave 4).
const CHORD = {
  C: { root: 'C2', comp: ['E4', 'G4'] },
  G: { root: 'G2', comp: ['G4', 'B4'] },
  Am: { root: 'A2', comp: ['A4', 'C5'] },
  F: { root: 'F2', comp: ['F4', 'A4'] },
  Em: { root: 'E2', comp: ['E4', 'G4'] },
  Ab: { root: 'Ab2', comp: ['Ab4', 'C5'] },
  Bb: { root: 'Bb2', comp: ['Bb4', 'D5'] },
};
// The fanfare's harmony shadows the lead instead of comping.
const FANFARE_HARMONY = ['r:4 E5:3 E5:1 E5:4 r:2 G5:1 G5:1', 'Eb5:6 Ab5:2 F5:6 Bb5:2', 'E5:12 r:4'];
const FANFARE_DRUMS = ['K:4 S:4 K:4 S:2 S:1 S:1', 'K:4 S:2 S:2 K:4 S:1 S:1 S:1 S:1', 'C:4 r:4 K:4 S:1 S:1 S:1 S:1'];
const BEAT = 'K:2 H:2 S:2 H:2 K:2 H:2 S:2 H:2';
const FILL = 'K:2 H:2 S:2 H:2 K:2 H:2 S:1 S:1 S:1 S:1';

function parseBar(bar, voice, at, out) {
  let t = at;
  for (const tok of bar.split(' ')) {
    const [name, len] = tok.split(':');
    if (name !== 'r') out.push({ voice, at: t, len: Number(len), note: voice === 'drum' ? name : midi(name) });
    t += Number(len);
  }
  if (t - at !== BAR) throw new Error(`victorySong: ${voice} bar "${bar}" is ${t - at} steps, not ${BAR}`);
}

// Every note of the song as { voice, at, len (16ths), note }, sorted by start.
function score() {
  const ev = [];
  LEAD.forEach((bar, i) => parseBar(bar, 'lead', i * BAR, ev));
  CHORDS.forEach((pair, i) => {
    const at = i * BAR;
    if (i < FANFARE_BARS) {
      parseBar(FANFARE_HARMONY[i], 'harmony', at, ev);
      parseBar(FANFARE_DRUMS[i], 'drum', at, ev);
    } else {
      parseBar((i - FANFARE_BARS) % 8 === 7 ? FILL : BEAT, 'drum', at, ev);
    }
    pair.split(' ').forEach((name, half) => {
      const { root, comp } = CHORD[name];
      const r = midi(root);
      // Bass: octave-bouncing eighths (root, octave, fifth, octave).
      [r, r + 12, r + 7, r + 12].forEach((note, k) => ev.push({ voice: 'bass', at: at + half * 8 + k * 2, len: 2, note }));
      // Comp: off-beat stabs alternating two chord tones.
      if (i >= FANFARE_BARS) comp.forEach((n, k) => ev.push({ voice: 'harmony', at: at + half * 8 + 2 + k * 4, len: 2, note: midi(n) }));
    });
  });
  return ev.sort((a, b) => a.at - b.at);
}

const SONG = score();
const INTRO_STEPS = FANFARE_BARS * BAR;
const LOOP_STEPS = (LEAD.length - FANFARE_BARS) * BAR;
const INTRO = SONG.filter((e) => e.at < INTRO_STEPS);
const LOOP = SONG.filter((e) => e.at >= INTRO_STEPS).map((e) => ({ ...e, at: e.at - INTRO_STEPS }));

// A pulse wave's Fourier series; 25% duty is the classic NES lead, 50% a square.
function pulseWave(ctx, duty) {
  const n = 40;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = (4 / (Math.PI * k)) * Math.sin(Math.PI * k * duty);
  return ctx.createPeriodicWave(real, imag);
}

// Builds the synth on any AudioContext (live or offline) and returns play(event, time).
function synth(ctx, out) {
  const lead = pulseWave(ctx, 0.25);
  const square = pulseWave(ctx, 0.5);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const tone = (t, dur, freq, wave, gain, vibrato) => {
    const osc = ctx.createOscillator();
    if (typeof wave === 'string') osc.type = wave;
    else osc.setPeriodicWave(wave);
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.005);
    env.gain.setTargetAtTime(gain * 0.65, t + 0.005, 0.08); // decay to sustain
    env.gain.setTargetAtTime(0, t + dur, 0.015); // release
    osc.connect(env).connect(out);
    if (vibrato && dur > 0.3) {
      // Delayed vibrato on held notes: depth ramps from 0 to 14 cents.
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(14, t + dur);
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    osc.start(t);
    osc.stop(t + dur + 0.1);
  };

  const hiss = (t, type, freq, q, gain, decay) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
  };

  const kick = (t) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.7, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  };

  return (e, t) => {
    const dur = e.len * STEP;
    if (e.voice === 'lead') tone(t, dur * 0.92, hz(e.note), lead, 0.2, true);
    else if (e.voice === 'harmony') tone(t, dur * 0.6, hz(e.note), square, 0.07);
    else if (e.voice === 'bass') tone(t, dur * 0.85, hz(e.note), 'triangle', 0.32);
    else if (e.note === 'K') kick(t);
    else if (e.note === 'S') hiss(t, 'bandpass', 1800, 0.8, 0.35, 0.12);
    else if (e.note === 'H') hiss(t, 'highpass', 7000, 0.7, 0.07, 0.03);
    else if (e.note === 'C') hiss(t, 'highpass', 5000, 0.5, 0.18, 0.9);
  };
}

// Every event from the song's start up to `seconds`, as [event, time from start]: the fanfare
// once, then the theme looping.
function* timeline(seconds) {
  for (const e of INTRO) yield [e, e.at * STEP];
  for (let n = 0; ; n++) {
    const base = (INTRO_STEPS + n * LOOP_STEPS) * STEP;
    if (base > seconds) return;
    for (const e of LOOP) {
      const t = base + e.at * STEP;
      if (t > seconds) return;
      yield [e, t];
    }
  }
}

// Plays live on the scene's sound manager, scheduling ~150ms ahead on the audio clock.
// Returns { stop() }, or null without WebAudio (Phaser's HTML5 audio fallback).
export function playVictorySong(scene) {
  const ctx = scene.sound.context;
  if (!ctx || !scene.sound.destination) return null;
  const out = ctx.createGain();
  out.gain.value = MASTER;
  out.connect(scene.sound.destination);
  const play = synth(ctx, out);
  const start = ctx.currentTime + 0.1;
  const events = timeline(Infinity);
  let next = events.next().value;
  const tick = () => {
    const horizon = ctx.currentTime + 0.15;
    while (next && start + next[1] < horizon) {
      const t = start + next[1];
      if (t >= ctx.currentTime) play(next[0], t); // skip notes we're already late for
      next = events.next().value;
    }
  };
  tick();
  const timer = scene.time.addEvent({ delay: 30, loop: true, callback: tick });
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      timer.remove();
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.25);
      setTimeout(() => out.disconnect(), 400);
    },
  };
}

// Offline render for checks (loudness, length): the song's first `seconds` as an AudioBuffer.
export async function renderVictorySong(seconds, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const out = ctx.createGain();
  out.gain.value = MASTER;
  out.connect(ctx.destination);
  const play = synth(ctx, out);
  for (const [e, t] of timeline(seconds)) play(e, t);
  return ctx.startRendering();
}

export const SONG_INFO = { bpm: BPM, introSeconds: INTRO_STEPS * STEP, loopSeconds: LOOP_STEPS * STEP, notes: SONG.length };
