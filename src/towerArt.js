// Procedural pixel art for the Salesforce Tower's floors: the office window wall (the city
// shows through its cutouts), the Ohana Floor's glass, the elevator bank and its steel doors,
// the elevator car, the chatbots' popups, and the props of floors 59 (the SDR bullpen), 60 (the
// Dreamfarce demo center) and 61 (the Ohana Floor, after Travis's photos in feed/sfohana).

import { fillEllipse, hardenAlpha, line, rect, rng } from './hqArt.js';

export const CEILING = 32; // the window head: glass runs from here down to the floor
const SILL = 156;

// Office window wall, one 96px bay: acoustic ceiling with downlights, then two 40px windows
// between pale columns. The glass is left transparent so the camera-pinned skyline shows
// through; a few opaque glints and a mullion per window read as the pane.
export function drawTowerWall(ctx) {
  const W = 96;
  rect(ctx, 0, 0, W, 26, '#d9d6cf');
  for (let x = 0; x < W; x += 12) rect(ctx, x, 0, 1, 26, '#c9c5bc');
  rect(ctx, 0, 12, W, 1, '#c9c5bc');
  for (const cx of [24, 72]) {
    rect(ctx, cx - 3, 18, 6, 2, '#fff6dc');
    rect(ctx, cx - 4, 20, 8, 1, '#b9b4aa');
  }
  rect(ctx, 0, 26, W, 2, '#a9a49a');
  rect(ctx, 0, 28, W, 3, '#e6e2da');
  rect(ctx, 0, CEILING - 1, W, 1, '#8f8a80');
  const COLUMN = ['#a8a49b', '#cfcbc2', '#d8d4cc', '#b9b5ad'];
  for (const [x0, w] of [[0, 4], [44, 8], [92, 4]]) {
    for (let x = x0; x < x0 + w; x++) rect(ctx, x, CEILING, 1, SILL - CEILING, COLUMN[Math.min(3, x - x0, x0 + w - 1 - x) % 4]);
  }
  for (const x of [23, 71]) rect(ctx, x, CEILING, 1, SILL - CEILING, '#4d535e');
  line(ctx, 30, 110, 34, 106, '#e8f0f8'); // one glint per bay reads as glass
  rect(ctx, 0, SILL, W, 2, '#8f8a80');
  rect(ctx, 0, SILL + 2, W, 192 - SILL - 2, '#2a2b30');
}

// The Ohana Floor: floor-to-ceiling glass in slim dark frames, a white ceiling with a round
// light cove per bay.
export function drawOhanaWall(ctx) {
  const W = 96;
  rect(ctx, 0, 0, W, 24, '#ecebe7');
  fillEllipse(ctx, 48, 12, 14, 4, '#f7f3e6');
  rect(ctx, 34, 11, 1, 3, '#cfcbc0');
  rect(ctx, 62, 11, 1, 3, '#cfcbc0');
  rect(ctx, 0, 24, W, 2, '#bdb9ae');
  rect(ctx, 0, 26, W, CEILING - 26, '#f2f0ea');
  rect(ctx, 0, CEILING - 1, W, 1, '#8f8a80');
  for (const x of [0, 32, 64]) rect(ctx, x, CEILING, 2, SILL - CEILING, '#3a3f47');
  line(ctx, 70, 108, 74, 104, '#eef6fc');
  rect(ctx, 0, SILL, W, 2, '#6a6a70');
  rect(ctx, 0, SILL + 2, W, 192 - SILL - 2, '#2a2b30');
}

// The elevator bank at the end of floors 59 and 60, 144x160 like FACADE (door at x = 88): walnut
// panelling, two steel-framed cars with up lanterns, the call button between them. The right
// car's opening shows its lit interior behind the sliding elev_door panels.
export function drawElevatorBank(ctx) {
  const W = 144;
  const H = 160;
  const D = 88;
  rect(ctx, 0, 0, W, 26, '#d9d6cf');
  for (let x = 0; x < W; x += 12) rect(ctx, x, 0, 1, 26, '#c9c5bc');
  rect(ctx, 0, 26, W, 2, '#a9a49a');
  for (let x = 0; x < W; x++) {
    const plank = Math.floor(x / 18);
    rect(ctx, x, 28, 1, H - 28, x % 18 === 0 ? '#2e2018' : ['#5a3e2a', '#634530', '#553a27'][plank % 3]);
  }
  rect(ctx, 0, 96, W, 2, '#8a6a48');
  rect(ctx, 0, H - 4, W, 4, '#2a211b');
  for (const cx of [40, D]) {
    rect(ctx, cx - 14, 120, 28, H - 120, '#8a9098'); // steel frame
    rect(ctx, cx - 13, 121, 26, 1, '#c9ced6');
    rect(ctx, cx - 10, 130, 20, H - 130, cx === D ? '#e8d7b0' : '#aab0b8');
    if (cx === D) {
      rect(ctx, cx - 10, 130, 20, 3, '#fff4d8'); // the car's ceiling light
      rect(ctx, cx - 10, 146, 20, 1, '#8a5a32'); // handrail
      rect(ctx, cx - 10, H - 2, 20, 2, '#3a3a3e');
    } else {
      rect(ctx, cx, 130, 1, H - 130, '#6c727b'); // closed doors
      for (let x = cx - 9; x < cx + 10; x += 2) rect(ctx, x, 131, 1, H - 132, '#b9bec5');
    }
    // Up lantern over each car.
    for (let i = 0; i < 3; i++) rect(ctx, cx - i, 108 + i, 1 + 2 * i, 1, '#ffb000');
    rect(ctx, cx - 3, 111, 7, 1, '#6a4a10');
  }
  rect(ctx, 62, 132, 4, 8, '#8a9098');
  rect(ctx, 63, 134, 2, 2, '#ffb000');
}

// One sliding elevator door: brushed steel, darker edges, the meeting edge on the right (x 9).
export function drawElevatorDoor(ctx) {
  for (let x = 0; x < 10; x++) rect(ctx, x, 0, 1, 30, x === 0 || x === 9 ? '#7d838c' : x % 2 ? '#aeb3bb' : '#c3c8cf');
  rect(ctx, 0, 0, 10, 1, '#d8dce2');
  rect(ctx, 0, 29, 10, 1, '#5d636c');
}

// The elevator car's interior, 128x100, seen through its open front: a light panel ceiling,
// brushed steel walls in perspective, a wood handrail, a granite floor, and the floor display.
export function drawElevatorCar(ctx) {
  const W = 128;
  const H = 100;
  rect(ctx, 0, 0, W, H, '#3a3d44');
  for (let x = 10; x < W - 10; x++) rect(ctx, x, 10, 1, 80, (x - 10) % 16 === 0 ? '#7c828b' : (x >> 1) % 2 ? '#a3a9b1' : '#b3b8bf');
  for (let y = 0; y < 10; y++) rect(ctx, 10 - y, y, W - 20 + 2 * y, 1, y < 2 ? '#8f959d' : '#fff4d8');
  for (let y = 0; y < 10; y++) {
    rect(ctx, 0, 10 + y, 10 - y, 1, '#6c727b'); // the side walls, in perspective
    rect(ctx, W - 10 + y, 10 + y, 10 - y, 1, '#6c727b');
  }
  rect(ctx, 0, 20, 10, 70, '#6c727b');
  rect(ctx, W - 10, 20, 10, 70, '#5d636c');
  rect(ctx, 10, 62, W - 20, 2, '#8a5a32');
  rect(ctx, 10, 64, W - 20, 1, '#5a3a22');
  for (let y = 90; y < H; y++) rect(ctx, 10 - (y - 90), y, W - 20 + 2 * (y - 90), 1, '#2a2a2e');
  const r = rng(61);
  for (let i = 0; i < 40; i++) rect(ctx, 4 + Math.floor(r() * (W - 8)), 91 + Math.floor(r() * 9), 1, 1, '#4a4a52');
  rect(ctx, 50, 14, 28, 11, '#0d0d0d');
  rect(ctx, 50, 14, 28, 1, '#5d636c');
}

// A chatbot's popup: a blue title bar with a red close box over a white body, a little chatbot
// avatar at the left. Its title and lines are worldText overlays.
function popupWindow(ctx, w, h, bar) {
  rect(ctx, 0, 0, w, h, '#30363d');
  rect(ctx, 1, 1, w - 2, bar, '#1f6fb5');
  rect(ctx, 1, 1, w - 2, 1, '#58a6ff');
  rect(ctx, 1, bar + 1, w - 2, h - bar - 2, '#f5f5f5');
  rect(ctx, w - 8, 2, bar - 2, bar - 2, '#e5534b');
  for (let i = 0; i < bar - 4; i++) {
    rect(ctx, w - 7 + i, 3 + i, 1, 1, '#f5f5f5');
    rect(ctx, w - 4 - i, 3 + i, 1, 1, '#f5f5f5');
  }
}

export function drawPopup(ctx) {
  popupWindow(ctx, 112, 32, 7);
  rect(ctx, 4, 12, 8, 8, '#8fd0ff');
  rect(ctx, 6, 14, 1, 2, '#0d0d0d');
  rect(ctx, 9, 14, 1, 2, '#0d0d0d');
  rect(ctx, 6, 17, 4, 1, '#0d0d0d');
}

export function drawPopupSmall(ctx) {
  popupWindow(ctx, 88, 24, 6);
}

// Floor 59's gong, rung on every contract lock: a bronze disc on a dark wood stand.
export function drawGong(ctx) {
  rect(ctx, 1, 2, 2, 28, '#3a2618');
  rect(ctx, 21, 2, 2, 28, '#3a2618');
  rect(ctx, 0, 1, 24, 3, '#4e3322');
  rect(ctx, 7, 4, 1, 3, '#8b8b8b');
  rect(ctx, 16, 4, 1, 3, '#8b8b8b');
  fillEllipse(ctx, 12, 15, 8, 8, '#a67a2a');
  fillEllipse(ctx, 12, 15, 6, 6, '#c9973a');
  fillEllipse(ctx, 12, 15, 2, 2, '#a67a2a');
  rect(ctx, 8, 10, 3, 1, '#f0c060');
  rect(ctx, 0, 28, 24, 2, '#2a1c12');
}

// A wall screen (the SDR leaderboard): dark bezel, a blue header bar, a dark screen.
export function drawScreen(ctx) {
  rect(ctx, 0, 0, 60, 38, '#1a1b20');
  rect(ctx, 2, 2, 56, 34, '#0f1d33');
  rect(ctx, 2, 2, 56, 8, '#1f6fb5');
  rect(ctx, 28, 38, 4, 2, '#1a1b20');
}

// The SDR bullpen behind the standing desks: two workstations per bay, each a desk with dual
// monitors glowing with CRM dashboards and a mesh chair.
export function drawBullpen(ctx) {
  for (const x0 of [4, 52]) {
    rect(ctx, x0, 17, 40, 2, '#cfc6b4');
    rect(ctx, x0, 19, 40, 1, '#8d8474');
    rect(ctx, x0 + 2, 20, 2, 8, '#3a3d44');
    rect(ctx, x0 + 36, 20, 2, 8, '#3a3d44');
    for (const mx of [x0 + 6, x0 + 21]) {
      rect(ctx, mx, 4, 14, 10, '#1a1b20');
      rect(ctx, mx + 1, 5, 12, 8, '#16324f');
      rect(ctx, mx + 2, 6, 10, 1, '#58a6ff');
      rect(ctx, mx + 2, 8, 4, 4, '#3fb950');
      rect(ctx, mx + 7, 10, 5, 2, '#e3b341');
      rect(ctx, mx + 6, 14, 2, 3, '#3a3d44');
    }
    rect(ctx, x0 + 14, 18, 10, 6, '#23252b'); // mesh chair back, from behind
    rect(ctx, x0 + 18, 24, 2, 4, '#3a3d44');
  }
}

// A Dreamfarce expo booth: a blue backdrop with a white name band and a cloud, and a counter.
export function drawBooth(ctx) {
  rect(ctx, 4, 0, 64, 42, '#1f6fb5');
  rect(ctx, 4, 0, 64, 10, '#f5f7fa');
  rect(ctx, 4, 10, 64, 1, '#154f86');
  for (const [cx, cy, rx, ry] of [[30, 26, 7, 5], [37, 23, 8, 7], [45, 26, 7, 5], [37, 29, 15, 3]]) fillEllipse(ctx, cx, cy, rx, ry, '#f5f7fa');
  rect(ctx, 0, 40, 72, 3, '#e8ecf0');
  rect(ctx, 2, 43, 68, 11, '#f5f7fa');
  rect(ctx, 2, 50, 68, 4, '#1f6fb5');
  rect(ctx, 0, 54, 72, 2, '#2a2b30');
}

// The Ohana Floor's living walls: a floor-to-ceiling column of ferns and flowering plants.
export function drawGreenWall(ctx) {
  const r = rng(61);
  const H = 128;
  rect(ctx, 1, 0, 18, H, '#1f3a22');
  const LEAVES = ['#2d5a2f', '#3f7a3a', '#5a9a4a', '#79b85a', '#3f7a3a'];
  for (let i = 0; i < 150; i++) {
    const x = 2 + Math.floor(r() * 16);
    const y = Math.floor(r() * H);
    fillEllipse(ctx, x, y, 1 + Math.floor(r() * 2), 1, LEAVES[Math.floor(r() * LEAVES.length)]);
  }
  for (let i = 0; i < 14; i++) rect(ctx, 3 + Math.floor(r() * 14), Math.floor(r() * H), 1, 1, r() < 0.5 ? '#b8436a' : '#8a4fa8');
  for (let y = 0; y < H; y++) {
    rect(ctx, 0, y, 1, 1, '#16291a');
    rect(ctx, 19, y, 1, 1, '#16291a');
  }
  rect(ctx, 0, H - 3, 20, 3, '#2a2b30');
}

// A curvy blue sofa from the Ohana lounge (48x16), side on.
export function drawSofa(ctx) {
  fillEllipse(ctx, 6, 8, 5, 6, '#3f4598');
  fillEllipse(ctx, 42, 8, 5, 6, '#3f4598');
  rect(ctx, 5, 3, 38, 6, '#4a51ac');
  rect(ctx, 5, 3, 38, 1, '#6c73cc');
  rect(ctx, 3, 9, 42, 4, '#5a61c2');
  rect(ctx, 3, 13, 42, 3, '#2f3478');
}

// An orange shell lounge chair (14x14).
export function drawLoungeChair(ctx) {
  fillEllipse(ctx, 6, 6, 5, 5, '#e8773c');
  rect(ctx, 2, 6, 10, 4, '#e8773c');
  rect(ctx, 3, 3, 3, 1, '#f5a070');
  rect(ctx, 6, 10, 2, 3, '#3a2618');
  rect(ctx, 3, 13, 8, 1, '#3a2618');
}

// The lounge's mottled rug, edge-on on the floor: blues, teals and a yellow-green.
export function drawOhanaRug(ctx) {
  const r = rng(7);
  const C = ['#3a8fb0', '#5fb3a0', '#c8d860', '#2e6f8a', '#8fd0c0'];
  for (let x = 0; x < 112; x++) {
    const inset = x < 6 || x > 105 ? 1 : 0;
    for (let y = inset; y < 5 - inset; y++) rect(ctx, x, y, 1, 1, C[Math.floor(r() * C.length)]);
  }
}

export const TOWER_ART = {
  tower_wall: { w: 96, h: 192, draw: drawTowerWall },
  ohana_wall: { w: 96, h: 192, draw: drawOhanaWall },
  elevator_bank: { w: 144, h: 160, draw: drawElevatorBank },
  elev_door: { w: 10, h: 30, draw: drawElevatorDoor },
  elevator_car: { w: 128, h: 100, draw: drawElevatorCar },
  popup: { w: 112, h: 32, draw: drawPopup },
  popup_small: { w: 88, h: 24, draw: drawPopupSmall },
  gong: { w: 24, h: 30, draw: drawGong },
  screen: { w: 60, h: 40, draw: drawScreen },
  bullpen: { w: 96, h: 28, draw: drawBullpen },
  booth: { w: 72, h: 56, draw: drawBooth },
  green_wall: { w: 20, h: 128, draw: drawGreenWall },
  sofa: { w: 48, h: 16, draw: drawSofa },
  lounge_chair: { w: 14, h: 14, draw: drawLoungeChair },
  ohana_rug: { w: 112, h: 5, draw: drawOhanaRug },
};

export function buildTowerTextures(scene) {
  for (const [key, { w, h, draw }] of Object.entries(TOWER_ART)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    hardenAlpha(ctx, w, h);
    tex.refresh();
  }
}
