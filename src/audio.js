// Mute state lives here instead of being read back from the sound manager. Phaser's WebAudio
// getter reads a gain node that only updates once the audio thread runs (and never while the
// context is still suspended), so `sound.mute = !sound.mute` can set the same value twice.
let muted = false;

export const isMuted = () => muted;

export function setMuted(sound, on) {
  muted = on;
  sound.mute = on;
}

export const toggleMute = (sound) => setMuted(sound, !muted);
