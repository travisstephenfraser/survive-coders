import { createRunClock } from './runClock.js';
import { MAX_HP, params } from './util.js';
import { voice } from './voice.js';
import { sfx } from './audio.js';

// The one run clock (runClock.js), and what ties it to the game.
export const run = createRunClock();

// Feeds the clock's check every frame. The clock itself reads wall time, pauses included.
export function installRunClock(game) {
  game.events.on('step', () => run.frame(game.loop.rawDelta));
  if (import.meta.env.DEV) window.run = run; // debugging hook for dev builds only
}

// Level-jump flags start a run mid-game: fine for testing, never ranked.
const JUMPS = ['park', 'tower', 'chute', 'landing', 'ride', 'boss'];

// Back to the start of a level with what the player brought into it (its checkpoint), from a
// death's retry or the pause screen's restart. The run clock keeps going, so a retry costs
// time, and so do the powers' cooldowns: a restart used to refill them, so a restart at a
// level's start could skip a cooldown the run would otherwise wait out. The first level has
// no checkpoint: going back to its start is a new run instead.
export function retryLevel(scene, key) {
  if (key === 'Level1') return beginRun(scene);
  const reg = scene.registry;
  reg.set({ hp: MAX_HP, boss: null, toast: null, stars: reg.get('checkpointStars') ?? 0, maxTokens: reg.get('checkpointTokens') ?? 0 });
  scene.scene.start(key);
}

// A new run, from PLAY NOW, "play again" after a win, or going back to the first level: fresh
// stats, a fresh clock, and the first level (or the one a level-jump flag names). God mode is
// read from the registry.
export function beginRun(scene) {
  const reg = scene.registry;
  voice.resetCooldowns();
  sfx(scene, 'start', 0.5);
  // The boss's entrance can't be skipped, so each run gets it once (the other intros can be).
  reg.set({ hp: MAX_HP, stars: 0, maxTokens: 0, checkpointStars: 0, checkpointTokens: 0, boss: null, towerFloor: null, elevatorSongAt: 0, cutscene: false, toast: null, bossIntroSeen: false });
  run.start({ god: Boolean(reg.get('god')), dev: JUMPS.some((k) => params.has(k)) });
  const floor = Number(params.get('tower'));
  if (params.has('tower')) scene.scene.start('Tower', { floor: [59, 60, 61].includes(floor) ? floor : 59 });
  else scene.scene.start({ park: 'Park', chute: 'Chute', landing: 'Landing', ride: 'Ride', boss: 'BossHQ' }[JUMPS.find((k) => params.has(k))] ?? 'Level1', {});
}
