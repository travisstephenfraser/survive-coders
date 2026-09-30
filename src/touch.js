import { params } from './util.js';
import { paintSprite, spriteSize } from './sprites.js';
import { EXTRA } from './glyphs.js';

// Touch controls for phones and tablets: a D-pad bottom-left, FIRE and JUMP bottom-right.
// They are DOM buttons anchored to the screen's corners rather than drawn in the canvas: the
// canvas is letterboxed 16:9, so on wide phones the buttons sit partly in the side bars and
// on tablets in the bottom bar, covering less of the game. Player.tick ORs `touch` with the
// keyboard. Powers, the mic and pause are tap targets in the HUD scene (HUD.js).
// ?touch forces the touch UI on a desktop, for testing with a mouse.
export const TOUCH = matchMedia('(pointer: coarse)').matches || params.has('touch');

let presses = 0;
let taken = 0;
export const touch = {
  left: false,
  right: false,
  jump: false,
  fire: false,
  // True once per JUMP press (a thumb landing on it or sliding onto it), like JustDown.
  takeJump() {
    const pressed = presses > taken;
    taken = presses;
    return pressed;
  },
  // Forget presses not yet taken, so a jump tapped during a pause doesn't fire on resume.
  dropJump() {
    taken = presses;
  },
};

const CSS = `
#pad { --u: clamp(52px, 17vh, 84px); --gap: 10px; --edge: 12px; position: fixed; inset: 0; pointer-events: none; z-index: 2; }
#pad[hidden] { display: none; }
#pad.paused { opacity: 0.35; }
#pad.steer .act { display: none; }
#pad .zone { position: absolute; pointer-events: auto; touch-action: none; }
#pad .btn { position: absolute; box-sizing: border-box; width: var(--u); height: var(--u); border: 3px solid rgba(217, 119, 87, 0.8);
  background: rgba(13, 13, 13, 0.45) center / 50% no-repeat; image-rendering: pixelated; }
#pad .btn.on { background-color: rgba(217, 119, 87, 0.6); border-color: #f3a07a; }
#pad .dpad { left: calc(env(safe-area-inset-left) + var(--edge)); bottom: calc(env(safe-area-inset-bottom) + var(--edge));
  width: calc(var(--u) * 2 + var(--gap)); height: var(--u); }
#pad .dpad .left { left: 0; top: 0; }
#pad .dpad .right { left: calc(var(--u) + var(--gap)); top: 0; }
#pad .act { right: calc(env(safe-area-inset-right) + var(--edge)); bottom: calc(env(safe-area-inset-bottom) + var(--edge));
  width: calc(var(--u) * 2 + var(--gap)); height: calc(var(--u) * 1.5); }
#pad .act .fire { left: 0; top: 0; }
#pad .act .jump { right: 0; bottom: 0; }
#rotate { display: none; position: fixed; inset: 0; z-index: 3; background: #0d0d0d; color: #d97757; font: 16px Menlo, Monaco, monospace;
  flex-direction: column; align-items: center; justify-content: center; gap: 22px; text-align: center; }
#rotate .phone { width: 34px; height: 58px; border: 4px solid #d97757; border-radius: 7px; animation: turn 2.2s ease-in-out infinite; }
#rotate small { color: #8b8b8b; font-size: 13px; }
@keyframes turn { 0%, 30% { transform: rotate(0); } 60%, 100% { transform: rotate(-90deg); } }
@media (orientation: portrait) { #rotate { display: flex; } }
`;

// Pixel icon as a data URL: a font glyph (8x8 rows of '#') or a sprite from sprites.js.
function icon(src, color = '#f5f5f5') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (Array.isArray(src)) {
    [c.width, c.height] = [8, 8];
    ctx.fillStyle = color;
    src.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && ctx.fillRect(x, y, 1, 1)));
  } else {
    ({ w: c.width, h: c.height } = spriteSize(src));
    paintSprite(ctx, src);
  }
  return `url(${c.toDataURL()})`;
}

let pad = null;

function build() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  pad = document.createElement('div');
  pad.id = 'pad';
  pad.hidden = true;
  pad.innerHTML = `
    <div class="zone dpad"><span class="btn left"></span><span class="btn right"></span></div>
    <div class="zone act"><span class="btn fire"></span><span class="btn jump"></span></div>`;
  document.body.append(pad);
  const rotate = document.createElement('div');
  rotate.id = 'rotate';
  rotate.innerHTML = '<div class="phone"></div><div>turn your phone sideways</div><small>Survive Coders plays in landscape</small>';
  document.body.append(rotate);

  const $ = (sel) => pad.querySelector(sel);
  const btn = { left: $('.left'), right: $('.right'), fire: $('.fire'), jump: $('.jump') };
  btn.left.style.backgroundImage = icon(EXTRA['←']);
  btn.right.style.backgroundImage = icon(EXTRA['→']);
  btn.jump.style.backgroundImage = icon(EXTRA['↑']);
  btn.fire.style.backgroundImage = icon('bolt'); // the prompt the laptop fires

  // Each pointer belongs to the zone it landed in and keeps steering it while it slides, so
  // a thumb can roll from left to right, or from FIRE to JUMP, without lifting.
  const held = new Map(); // pointerId -> { left, right, fire, jump }
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const read = (zone, e) => {
    if (zone === 'dpad') {
      const [cx] = centre($('.dpad'));
      return { left: e.clientX < cx, right: e.clientX >= cx };
    }
    // Nearest button wins; on the seam between them (distances within 20% of a button),
    // both press, so one thumb can jump and fire together.
    const d = ['fire', 'jump'].map((k) => {
      const [cx, cy] = centre(btn[k]);
      return Math.hypot(e.clientX - cx, e.clientY - cy);
    });
    const seam = Math.abs(d[0] - d[1]) < btn.fire.offsetWidth * 0.2;
    return { fire: seam || d[0] < d[1], jump: seam || d[1] < d[0] };
  };
  const sync = () => {
    const now = { left: false, right: false, fire: false, jump: false };
    for (const s of held.values()) for (const k in s) now[k] ||= s[k];
    if (now.jump && !touch.jump) presses++;
    for (const k in now) {
      touch[k] = now[k];
      btn[k].classList.toggle('on', now[k]);
    }
  };
  for (const zone of ['dpad', 'act']) {
    const el = $(`.${zone}`);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId); // keep the pointer after it slides off the zone
      } catch {
        /* synthetic pointer (tests) */
      }
      held.set(e.pointerId, read(zone, e));
      sync();
    });
    el.addEventListener('pointermove', (e) => {
      if (!held.has(e.pointerId)) return;
      held.set(e.pointerId, read(zone, e));
      sync();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.addEventListener(type, (e) => {
        if (held.delete(e.pointerId)) sync();
      });
    }
  }
  // Watchdog: wherever a finger lifts, its pointer is released. Touch pointers are implicitly
  // captured by the zone they land on, but a failed capture must never leave a button held.
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, (e) => held.delete(e.pointerId) && sync(), true);
  }
  // Keep these touches away from Phaser's window listeners, text selection and callouts.
  for (const type of ['touchstart', 'touchmove', 'touchend', 'contextmenu']) {
    pad.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  touch.reset = () => {
    held.clear();
    sync();
    taken = presses;
  };
  window.addEventListener('blur', () => touch.reset());
}

touch.reset = () => {};

// Shown by the HUD during play; hiding also releases everything, so nothing stays held. Under
// the canopy (Landing) only the D-pad shows: nothing to fire at, nowhere to jump from.
export function showPad(on, { steerOnly = false } = {}) {
  if (!TOUCH) return;
  if (!pad) build();
  pad.classList.toggle('steer', on && steerOnly);
  if (pad.hidden === !on) return;
  pad.hidden = !on;
  touch.reset();
}

// Dimmed, not hidden, while paused: a thumb resting on a button through a pause still
// counts on resume, as a held key does.
export function dimPad(on) {
  pad?.classList.toggle('paused', on);
}

// The rotate-your-phone overlay is CSS-only but has to exist before the title shows. Module
// scripts run after the document is parsed, so the body is there.
if (TOUCH) build();

// Android: go fullscreen and hold landscape from the tap that starts a run. iPhone Safari has
// no element fullscreen; there, "Add to Home Screen" runs fullscreen via the web manifest.
export function enterFullscreen() {
  const el = document.documentElement;
  if (!TOUCH || document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

// Settings' fullscreen toggle, on any device that has element fullscreen (so not iPhone). The
// whole page goes, not just the canvas, so the DOM overlays (the pad, the score form) come too.
// Has to run inside a tap or key press.
export const canFullscreen = () => !!document.fullscreenEnabled;
export const isFullscreen = () => !!document.fullscreenElement;
export function toggleFullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
  if (TOUCH) return enterFullscreen();
  return document.documentElement.requestFullscreen?.().catch(() => {});
}
