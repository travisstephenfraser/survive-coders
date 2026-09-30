import { createRunClock } from './runClock.js';
import { MAX_HP, params } from './util.js';
import { voice } from './voice.js';
import { sfx } from './audio.js';

// The one run clock (runClock.js), and what ties it to the game.
export const run = createRunClock();

const anyPaused = (game) => game.scene.scenes.some((s) => s.sys.isPaused());

// Drives the clock every frame, and the instant the tab hides or shows (a hidden tab draws no
// frames in most browsers, so only the event marks the moment).
export function installRunClock(game) {
  const liveNow = () => !document.hidden && !anyPaused(game);
  game.events.on('step', () => run.frame(liveNow(), game.loop.rawDelta));
  document.addEventListener('visibilitychange', () => run.setLive(liveNow()));
  if (import.meta.env.DEV) window.run = run; // debugging hook for dev builds only
}

// Level-jump flags start a run mid-game: fine for testing, never ranked.
const JUMPS = ['park', 'tower', 'chute', 'landing', 'ride', 'boss'];

// A new run, from PLAY NOW or from "play again" after a win: fresh stats, a fresh clock, and
// the first level (or the one a level-jump flag names). God mode is read from the registry.
export function beginRun(scene) {
  const reg = scene.registry;
  voice.resetCooldowns();
  sfx(scene, 'start', 0.5);
  reg.set({ hp: MAX_HP, stars: 0, maxTokens: 0, checkpointStars: 0, checkpointTokens: 0, boss: null, towerFloor: null, elevatorSongAt: 0, cutscene: false, toast: null });
  run.start({ god: Boolean(reg.get('god')), dev: JUMPS.some((k) => params.has(k)) });
  const floor = Number(params.get('tower'));
  if (params.has('tower')) scene.scene.start('Tower', { floor: [59, 60, 61].includes(floor) ? floor : 59 });
  else scene.scene.start({ park: 'Park', chute: 'Chute', landing: 'Landing', ride: 'Ride', boss: 'BossHQ' }[JUMPS.find((k) => params.has(k))] ?? 'Level1', {});
}
