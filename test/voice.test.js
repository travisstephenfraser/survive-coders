import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCounter, inHoldWindow } from '../src/voiceMatch.js';
import { keymap } from '../src/keymap.js';

// Execute the real controller without Phaser's DOM renderer. Only the browser's speech,
// microphone and clock are stand-ins; matching and power events use the production code.
const source = readFileSync(new URL('../src/voice.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
function setup({ starts = true } = {}) {
  let now = 0, nextTimer = 0, track;
  const timers = new Map();
  class Recognition {
    static available() {}
    static install() {}
    start() { if (starts) this.onstart?.(); }
    abort() { this.onend?.(); }
  }
  Recognition.prototype.processLocally = false;
  const mic = {
    async open() { track ??= { readyState: 'live' }; return { ok: true }; },
    track: () => track,
    close() { if (track) track.readyState = 'ended'; track = null; },
    speaking: () => false,
  };
  const voice = runInNewContext(`${source}\nvoice;`, {
    Phaser: { Events: { EventEmitter } }, TOUCH: false, keymap, mic, createCounter, inHoldWindow,
    settings: { get: () => 'open' }, micCheck: { passed: () => true },
    window: { SpeechRecognition: Recognition, addEventListener() {} },
    performance: { now: () => now },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  voice.local = 'available';
  return {
    voice, mic,
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= now) {
        timers.delete(id);
        timer.fn();
        await new Promise(setImmediate); // settle the browser promises across the VM boundary
      }
    },
  };
}
const result = (rec, text) => rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text, confidence: 1 }], { isFinal: true })] });

test('a microphone error with no end event closes the mic and leaves keyboard powers usable', async () => {
  const { voice, mic } = setup();
  await voice.beginCheck();
  voice.endCheck(true);
  const track = mic.track();
  voice.session.onerror({ error: 'audio-capture' });
  assert.equal(voice.running, false);
  assert.equal(voice.session, null);
  assert.equal(track.readyState, 'ended');
  const powers = [];
  voice.on('power', (name) => powers.push(name));
  voice.trigger('rollback', 'key');
  assert.deepEqual(powers, ['rollback']);
});

test('a transient audio-capture failure recovers with a fresh microphone and recognizer', async () => {
  const env = setup();
  await env.voice.beginCheck();
  const failed = env.voice.session;
  failed.onerror({ error: 'audio-capture' });
  failed.onend(); // browsers may send this after the error too
  await env.advance(2000);
  assert.notEqual(env.voice.session, failed);
  assert.equal(env.voice.running, true);
  const commands = [];
  env.voice.on('command', ({ name }) => commands.push(name));
  result(env.voice.session, 'rollback');
  assert.deepEqual(commands, ['rollback']);
});

test('a refused microphone with no end event stops without requesting it again', async () => {
  const env = setup();
  await env.voice.beginCheck();
  env.voice.session.onerror({ error: 'not-allowed' });
  await env.advance(10000);
  assert.equal(env.voice.session, null);
  assert.equal(env.mic.track(), null);
  assert.equal(env.voice.permission, 'denied');
  assert.ok(env.voice.error);
});

test('sessions that end after a second without results stop after three failures', async () => {
  const env = setup();
  await env.voice.beginCheck();
  for (let i = 0; i < 3; i++) {
    await env.advance(1100);
    env.voice.session.onend();
    await env.advance(2000);
  }
  assert.equal(env.voice.running, false);
  assert.equal(env.voice.session, null);
  assert.equal(env.mic.track(), null);
  assert.ok(env.voice.error);
});

test('an unexpected end waits before replacing the failed recognizer', async () => {
  const env = setup();
  await env.voice.beginCheck();
  const failed = env.voice.session;
  failed.onend();
  assert.equal(env.voice.running, false);
  assert.equal(env.voice.session, null);
  await env.advance(2000);
  assert.notEqual(env.voice.session, failed);
  assert.equal(env.voice.running, true);
  const commands = [];
  env.voice.on('command', ({ name }) => commands.push(name));
  result(failed, 'rollback'); // late results from the aborted recognizer are ignored
  result(env.voice.session, 'ship it');
  assert.deepEqual(commands, ['ship']);
});

test('pausing while recovery is pending never reopens the microphone', async () => {
  const env = setup();
  await env.voice.beginCheck();
  env.voice.endCheck(true);
  env.voice.session.onend();
  env.voice.listenWhile(false);
  await env.advance(10000);
  assert.equal(env.voice.session, null);
  assert.equal(env.mic.track(), null);
  assert.equal(env.voice.running, false);
});

test('a recognizer that never starts times out and eventually releases the microphone', async () => {
  const env = setup({ starts: false });
  await env.voice.beginCheck();
  for (let i = 0; i < 3; i++) {
    await env.advance(10000);
    await env.advance(2000);
  }
  assert.equal(env.voice.session, null);
  assert.equal(env.mic.track(), null);
  assert.ok(env.voice.error);
});
