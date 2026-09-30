import { settings } from './settings.js';

// Mute state lives here instead of being read back from the sound manager. Phaser's WebAudio
// getter reads a gain node that only updates once the audio thread runs (and never while the
// context is still suspended), so `sound.mute = !sound.mute` can set the same value twice.
let muted = settings.get('mute');

export const isMuted = () => muted;

export function setMuted(sound, on) {
  muted = on;
  sound.mute = on;
  settings.set('mute', on);
}

export const toggleMute = (sound) => setMuted(sound, !muted);

// Volumes are set per call (a song at 0.28, a star at 0.35) and scaled here by the player's
// music and SFX settings, so a level of 1 plays everything exactly as mixed.
export const musicVolume = (volume) => volume * settings.get('music');

export function sfx(scene, key, volume = 0.5) {
  const level = settings.get('sfx');
  if (level > 0 && scene.cache.audio.exists(key)) scene.sound.play(key, { volume: volume * level });
}
