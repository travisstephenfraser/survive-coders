// The elevator's music: an original easy-listening bossa stored as MIDI note numbers, like the
// victory song, and played on a small WebAudio lounge band (FM electric piano, vibraphone,
// bass, cross-stick, shaker). An 8-bar loop in F that picks up where the last ride left off, so
// the two rides up the tower hear one song. No audio file: songPlayer.js plays it through
// Phaser's master mute node, so muting (N) still applies.

import { hz, midi, parseBar, playOnScene, renderSong } from './songPlayer.js';

const BPM = 108;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const BAR = 16;
const MASTER = 0.17; // -32.0 LUFS, level with the level music at its 0.28 volume (-32.2)

// One bar per string: 'note:16ths', 'r' rests.
const VIBES = [
  'r:2 A4:2 C5:2 E5:6 D5:2 C5:2',
  'D5:4 E5:2 D5:2 C#5:6 A4:2',
  'F5:6 E5:2 D5:4 A4:4',
  'G4:2 Bb4:2 D5:2 Eb5:6 D5:2 C5:2',
  'D5:6 C5:2 A4:6 r:2',
  'r:2 Db5:2 F5:2 Db5:6 C5:4',
  'C5:6 B4:2 C5:2 E5:2 F#5:4',
  'F5:4 D5:2 Bb4:2 A4:4 G4:2 E4:2',
];

// Two chords per bar (half-bar each): I, iiø-V of vi, vi, ii-V of IV, IV, the minor iv and its
// bVII9, iii-VI, and ii-V back to the top.
const CHORDS = ['F F', 'Em7b5 A7', 'Dm Dm', 'Cm F7', 'Bb Bb', 'Bbm Eb', 'Am D7', 'Gm C7'];
// Bass (the root, then the fifth when the chord has the whole bar) and the electric piano's
// rootless voicing, which barely moves from chord to chord.
const CHORD = {
  F: { low: ['F2', 'C2'], keys: ['A3', 'C4', 'E4', 'G4'] }, // Fmaj9
  Em7b5: { low: ['E2'], keys: ['Bb3', 'D4', 'E4', 'G4'] },
  A7: { low: ['A2'], keys: ['Bb3', 'C#4', 'E4', 'G4'] }, // A7b9
  Dm: { low: ['D2', 'A1'], keys: ['A3', 'C4', 'E4', 'F4'] }, // Dm9
  Cm: { low: ['C2'], keys: ['Bb3', 'D4', 'Eb4', 'G4'] }, // Cm9
  F7: { low: ['F2'], keys: ['A3', 'D4', 'Eb4', 'G4'] }, // F13
  Bb: { low: ['Bb1', 'F2'], keys: ['A3', 'C4', 'D4', 'F4'] }, // Bbmaj9
  Bbm: { low: ['Bb1'], keys: ['G3', 'C4', 'Db4', 'F4'] }, // Bbm6/9
  Eb: { low: ['Eb2'], keys: ['G3', 'C4', 'Db4', 'F4'] }, // Eb9: the same four notes
  Am: { low: ['A2'], keys: ['G3', 'B3', 'C4', 'E4'] }, // Am9
  D7: { low: ['D2'], keys: ['F#3', 'B3', 'C4', 'E4'] }, // D13
  Gm: { low: ['G2'], keys: ['F3', 'A3', 'Bb3', 'D4'] }, // Gm9
  C7: { low: ['C2'], keys: ['E3', 'A3', 'Bb3', 'D4'] }, // C13
};
// The bossa clave over two bars (3-2): the cross-stick plays it and the keys comp on it.
const CLAVE = ['x:6 x:6 x:4', 'r:4 x:6 x:6'];
const SHAKER = 'h:2 H:2 h:2 H:2 h:2 H:2 h:2 H:2'; // H accents the off-beat

// Every note of the song as { voice, at, len (16ths), note }, sorted by start.
function score() {
  const ev = [];
  VIBES.forEach((bar, i) => parseBar(bar, 'vibes', i * BAR, ev));
  CHORDS.forEach((pair, i) => {
    const at = i * BAR;
    const [a, b] = pair.split(' ').map((name) => CHORD[name]);
    parseBar(SHAKER, 'shaker', at, ev);
    const hits = [];
    parseBar(CLAVE[i % 2], 'rim', at, hits);
    for (const hit of hits) {
      ev.push(hit, { voice: 'keys', at: hit.at, len: hit.len, note: (hit.at - at < 8 ? a : b).keys.map(midi) });
    }
    // Bass: a dotted quarter and an eighth on each half bar (the bossa's long-short).
    (a === b ? a.low : [a.low[0], b.low[0]]).forEach((name, half) => {
      ev.push({ voice: 'bass', at: at + half * 8, len: 6, note: midi(name) });
      ev.push({ voice: 'bass', at: at + half * 8 + 6, len: 2, note: midi(name) });
    });
  });
  return ev.sort((p, q) => p.at - q.at);
}

const SONG = score();
const LOOP_STEPS = VIBES.length * BAR;
const LOOP_SECONDS = LOOP_STEPS * STEP;
const BAR_SECONDS = BAR * STEP;

// Builds the band on any AudioContext (live or offline) and returns play(event, time).
function synth(ctx, out) {
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  // The vibraphone's motor: one tremolo over every bar struck, as on the real instrument.
  const vibes = ctx.createGain();
  vibes.gain.value = 0.7; // swings 0.4-1.0
  const motor = ctx.createOscillator();
  motor.frequency.value = 4.8;
  const depth = ctx.createGain();
  depth.gain.value = 0.3;
  motor.connect(depth).connect(vibes.gain);
  motor.start();
  vibes.connect(out);

  const sine = (t, freq, to) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    osc.connect(to);
    osc.start(t);
    return osc;
  };

  // Vibraphone: the bar's fundamental plus its 4x partial, which dies fast, then a long ring
  // until the pedal lets go.
  const vibe = (t, dur, freq, gain) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.002);
    env.gain.setTargetAtTime(0, t + 0.002, 1.1);
    env.gain.setTargetAtTime(0, t + dur, 0.3);
    env.connect(vibes);
    const partial = ctx.createGain();
    partial.gain.setValueAtTime(0.3, t);
    partial.gain.setTargetAtTime(0, t, 0.08);
    partial.connect(env);
    const end = t + dur + 1.6;
    sine(t, freq, env).stop(end);
    sine(t, freq * 4, partial).stop(end);
  };

  // Electric piano: FM, a sine bending a sine at the same pitch. The modulation index falls
  // away after the strike, leaving the bell of the attack and then a round tone.
  const key = (t, dur, freq, gain) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.003);
    env.gain.setTargetAtTime(0, t + 0.003, 0.9);
    env.gain.setTargetAtTime(0, t + dur, 0.07); // key up
    env.connect(out);
    const index = ctx.createGain();
    index.gain.setValueAtTime(freq * 2.2, t);
    index.gain.setTargetAtTime(freq * 0.35, t, 0.15);
    const carrier = sine(t, freq, env);
    const mod = sine(t, freq, index);
    index.connect(carrier.frequency);
    carrier.stop(t + dur + 0.4);
    mod.stop(t + dur + 0.4);
  };

  // Bass: a round triangle, with a plucked edge (a saw through a closing filter) so that
  // laptop and phone speakers still hear the line.
  const bass = (t, dur, freq) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.26, t + 0.008);
    env.gain.setTargetAtTime(0.15, t + 0.008, 0.2);
    env.gain.setTargetAtTime(0, t + dur, 0.04);
    env.connect(out);
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = freq;
    body.connect(env);
    const pluck = ctx.createOscillator();
    pluck.type = 'sawtooth';
    pluck.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.setTargetAtTime(250, t, 0.05);
    const edge = ctx.createGain();
    edge.gain.value = 0.25;
    pluck.connect(lp).connect(edge).connect(env);
    for (const osc of [body, pluck]) {
      osc.start(t);
      osc.stop(t + dur + 0.25);
    }
  };

  const hiss = (t, type, freq, q, gain, attack, decay) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(env).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.02);
  };

  // Cross-stick: a woody knock, and the click of the stick on the rim.
  const rim = (t) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.03);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.45, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.06);
    hiss(t, 'bandpass', 2600, 1.2, 0.25, 0.001, 0.025);
  };

  const play = (e, t) => {
    const dur = e.len * STEP;
    if (e.voice === 'vibes') vibe(t, dur, hz(e.note), 0.24);
    else if (e.voice === 'keys') e.note.forEach((n, k) => key(t + k * 0.012, dur * 0.8, hz(n), 0.075)); // rolled, low to high
    else if (e.voice === 'bass') bass(t, dur * 0.9, hz(e.note));
    else if (e.voice === 'rim') rim(t);
    else if (e.voice === 'shaker') hiss(t, 'highpass', 6500, 0.7, e.note === 'H' ? 0.12 : 0.06, 0.012, 0.05);
  };
  play.dispose = (t) => motor.stop(t);
  return play;
}

// Every event from `0` up to `seconds`, as [event, time from start], the loop repeating.
function* timeline(seconds) {
  for (let n = 0; ; n++) {
    const base = n * LOOP_SECONDS;
    for (const e of SONG) {
      const t = base + e.at * STEP;
      if (t > seconds) return;
      yield [e, t];
    }
  }
}

export const ELEVATOR = { master: MASTER, synth, timeline };

// Plays live on the scene's sound manager, `from` seconds into the loop, rounded to a bar so a
// ride that resumes the song starts on a downbeat. Returns { at(), stop(fade) }, or null
// without WebAudio.
export function playElevatorSong(scene, { from = 0 } = {}) {
  const bars = LOOP_STEPS / BAR;
  return playOnScene(scene, ELEVATOR, (Math.round((from % LOOP_SECONDS) / BAR_SECONDS) % bars) * BAR_SECONDS);
}

// Offline render for checks (loudness, length): the song's first `seconds` as an AudioBuffer.
export const renderElevatorSong = (seconds, sampleRate) => renderSong(ELEVATOR, seconds, sampleRate);

export const SONG_INFO = { bpm: BPM, loopSeconds: LOOP_SECONDS, barSeconds: BAR_SECONDS, notes: SONG.length };
