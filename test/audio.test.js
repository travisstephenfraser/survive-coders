import test from 'node:test';
import assert from 'node:assert/strict';
import { isMuted, setMuted, toggleMute } from '../src/audio.js';

// A sound manager whose mute getter never catches up, like Phaser's WebAudio manager while
// its AudioContext is still suspended (the getter reads a gain node the audio thread owns).
function laggingSound() {
  const sets = [];
  return {
    sets,
    get mute() {
      return false;
    },
    set mute(v) {
      sets.push(v);
    },
  };
}

test('two toggles unmute again even when the manager getter lags', () => {
  const sound = laggingSound();
  setMuted(sound, false);
  toggleMute(sound);
  assert.equal(isMuted(), true);
  toggleMute(sound);
  assert.equal(isMuted(), false);
  assert.deepEqual(sound.sets, [false, true, false]);
});
