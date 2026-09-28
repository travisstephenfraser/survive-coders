import Phaser from 'phaser';

// The later levels' songs load here, behind the title and the first level, so the first load
// only waits for what those two need (the songs are most of the download, which a phone feels).
// Launched by Boot, runs in parallel, draws nothing, and stops itself once they're in. A scene
// that asks for its song before it lands gets it the moment it does (loopSong).
export const LATER_SONGS = ['music_park', 'music_tower', 'music_fall', 'music_landing', 'music_boss'];

export default class Songs extends Phaser.Scene {
  constructor() {
    super('Songs');
  }

  preload() {
    this.load.on('loaderror', (file) => console.info(`[assets] ${file.key} missing, using fallback`));
    for (const k of LATER_SONGS) this.load.audio(k, `assets/audio/${k}.mp3`);
  }

  create() {
    this.scene.stop();
  }
}

// A looping song on `scene`: started now if it's loaded, or the moment it lands, unless the scene
// has shut down by then or no longer `wants` it. Hands the playing sound to `onPlay`.
export function loopSong(scene, key, volume, onPlay, wants = () => true) {
  const start = () => {
    const song = scene.sound.add(key, { loop: true, volume });
    song.play();
    onPlay(song);
  };
  const cache = scene.cache.audio;
  if (cache.exists(key)) return start();
  const onAdd = (_cache, added) => {
    if (added !== key) return;
    off();
    if (wants()) start();
  };
  const off = () => {
    cache.events.off('add', onAdd);
    scene.events.off('shutdown', off);
  };
  cache.events.on('add', onAdd);
  scene.events.once('shutdown', off);
}
