// Filtered-noise sound effects with no audio file, played through Phaser's master mute node so N
// still mutes them: the wind of the Chute's fall, and the terminal's key clicks. Both are no-ops
// without WebAudio (Phaser's HTML5 audio fallback).

const buffers = new WeakMap(); // a second of white noise per AudioContext

function noise(ctx) {
  if (!buffers.has(ctx)) {
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    buffers.set(ctx, buf);
  }
  return buffers.get(ctx);
}

// Wind rushing past: band-passed noise that rises in pitch as you speed up (set(0..1)).
// Returns { set(speed), stop() }.
export function wind(scene) {
  const ctx = scene.sound.context;
  const out = scene.sound.destination;
  if (!ctx || !out) return { set() {}, stop() {} };
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  src.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 380;
  band.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.8);
  src.connect(band).connect(gain).connect(out);
  src.start();
  let stopped = false;
  return {
    set(speed) {
      if (!stopped) band.frequency.setTargetAtTime(380 + 620 * speed, ctx.currentTime, 0.25);
    },
    stop(fade = 0.15) {
      if (stopped) return;
      stopped = true;
      gain.gain.setTargetAtTime(0, ctx.currentTime, fade);
      src.stop(ctx.currentTime + fade * 6);
    },
  };
}

// One key click: a few milliseconds of high-passed noise, a little lower for ENTER.
export function keyClick(scene, low = false) {
  const ctx = scene.sound.context;
  const out = scene.sound.destination;
  if (!ctx || !out) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = low ? 'bandpass' : 'highpass';
  f.frequency.value = low ? 1400 : 3200 + Math.random() * 1200;
  const env = ctx.createGain();
  env.gain.setValueAtTime(low ? 0.3 : 0.18, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + (low ? 0.06 : 0.025));
  src.connect(f).connect(env).connect(out);
  src.start(t, Math.random() * 0.8);
  src.stop(t + 0.08);
}
