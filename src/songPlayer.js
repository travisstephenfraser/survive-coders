// Plays the songs written as note data (victorySong.js, elevatorSong.js) on WebAudio. A song is
// { master, synth, timeline }: synth(ctx, out) builds its instruments on any AudioContext and
// returns play(event, time); timeline(seconds) yields [event, seconds from the song's start].
// Songs play through Phaser's master mute node, so muting (N) applies, and there is no file.

import { musicVolume } from './audio.js';

// Scientific pitch name to MIDI note number: 'C4' 60, 'Ab5' 80.
const PITCH = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(name) {
  const [, letter, acc, oct] = /^([A-G])([#b]?)(\d)$/.exec(name);
  return 12 * (Number(oct) + 1) + PITCH[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0);
}
export const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// One bar per string: 'note:16ths', 'r' rests. A pitch ('Ab5') becomes a MIDI number; anything
// else ('K', 'S') is a drum and stays a name.
export function parseBar(bar, voice, at, out, steps = 16) {
  let t = at;
  for (const tok of bar.split(' ')) {
    const [name, len] = tok.split(':');
    if (name !== 'r') out.push({ voice, at: t, len: Number(len), note: /\d$/.test(name) ? midi(name) : name });
    t += Number(len);
  }
  if (t - at !== steps) throw new Error(`${voice} bar "${bar}" is ${t - at} steps, not ${steps}`);
}

// Plays live, scheduling ~150ms ahead on the audio clock from a timer. `every(ms, fn)` runs the
// timer and returns its cancel (default setInterval; scenes pass their clock, which pauses with
// them); `gain` scales the song's master level; `from` starts that many seconds into the song.
// Returns { at(), stop(fade) }, where at() is how far into the song it has played.
export function playSong(song, { ctx, destination, every = interval, gain = 1 }, from = 0) {
  const out = ctx.createGain();
  out.gain.value = song.master * gain;
  out.connect(destination);
  const play = song.synth(ctx, out);
  const start = ctx.currentTime + 0.1 - from;
  const events = song.timeline(Infinity);
  let next = events.next().value;
  while (next && next[1] < from) next = events.next().value;
  const tick = () => {
    const horizon = ctx.currentTime + 0.15;
    while (next && start + next[1] < horizon) {
      const t = start + next[1];
      if (t >= ctx.currentTime) play(next[0], t); // skip notes we're already late for
      next = events.next().value;
    }
  };
  tick();
  const cancel = every(30, tick);
  let stoppedAt = null;
  return {
    at: () => Math.max(0, (stoppedAt ?? ctx.currentTime) - start),
    stop(fade = 0.25) {
      if (stoppedAt !== null) return;
      stoppedAt = ctx.currentTime;
      cancel();
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + fade);
      setTimeout(() => {
        out.disconnect();
        play.dispose?.(now + fade);
      }, (fade + 0.15) * 1000);
    },
  };
}

function interval(ms, fn) {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}

// playSong on a scene's sound manager and clock. Null without WebAudio (Phaser's HTML5 audio
// fallback).
export function playOnScene(scene, song, from = 0) {
  const ctx = scene.sound.context;
  if (!ctx || !scene.sound.destination) return null;
  const every = (ms, fn) => {
    const timer = scene.time.addEvent({ delay: ms, loop: true, callback: fn });
    return () => timer.remove();
  };
  return playSong(song, { ctx, destination: scene.sound.destination, every, gain: musicVolume(1) }, from);
}

// Offline render for checks (loudness, length): the song's first `seconds` as an AudioBuffer.
export async function renderSong(song, seconds, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const out = ctx.createGain();
  out.gain.value = song.master;
  out.connect(ctx.destination);
  const play = song.synth(ctx, out);
  for (const [e, t] of song.timeline(seconds)) play(e, t);
  play.dispose?.(seconds);
  return ctx.startRendering();
}
