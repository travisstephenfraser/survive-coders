// Procedural pixel art for Salesforce Park: the Transit Center seen from the street (Level 1's
// exit, the park's trees over its roof), the Salesforce Tower lobby (the park's exit), and the
// gondola that carries you up. Facades share hqArt's FACADE geometry, so the same sliding
// hq_door panels and walk-in work at every building.

import { FACADE, drawPlant, fillEllipse, hardenAlpha, light, line, mix, rect, rng } from './hqArt.js';

const SOFFIT = 104;
const LOBBY = 112;

// Lobby band shared by both facades: soffit, lit interior, glass, mullions, the door header
// and sidelights around the opening at x = FACADE.door (the hq_door panels slide across it).
function lobby(ctx, W, H, D, { lightTop, lightLow, glass, frame, soffit }) {
  rect(ctx, 0, SOFFIT, W, 1, soffit[0]);
  rect(ctx, 0, SOFFIT + 1, W, 4, soffit[1]);
  rect(ctx, 0, SOFFIT + 5, W, 3, '#26231f');
  for (let x = 5; x < W; x += 12) rect(ctx, x, SOFFIT + 7, 2, 1, '#fff2cc');
  for (let y = LOBBY; y < H - 2; y++) rect(ctx, 0, y, W, 1, mix(lightTop, lightLow, (y - LOBBY) / (H - LOBBY)));
  for (let x = 0; x < W; x += 1) if ((x + LOBBY) % 41 < 2) line(ctx, x, LOBBY, Math.min(W - 1, x + 20), LOBBY + 20, glass);
  for (const x of [0, 26, 52, 124]) rect(ctx, x, LOBBY, 1, H - LOBBY, frame);
  rect(ctx, 0, 127, W, 1, frame);
  rect(ctx, 0, H - 2, W, 2, '#2a2119');
  rect(ctx, D - 22, 124, 44, 6, '#2c241d');
  rect(ctx, D - 22, 124, 44, 1, '#54473b');
  rect(ctx, D - 1, 126, 2, 1, '#58a6ff');
  for (const x of [D - 22, D - 11, D + 10, D + 21]) rect(ctx, x, 130, 1, H - 132, frame);
  rect(ctx, D - 10, H - 2, 20, 1, '#6b4a2f');
  rect(ctx, D - 10, H - 1, 20, 1, '#a39684');
}

// Perforations: the real panels are punched in a Penrose rhomb tiling. Five plane waves 72°
// apart interfere into the same 5-fold, never-repeating rosettes, which is what the tiling
// reads as from the street; the holes are a fine grid, punched only where the field is high.
const PENROSE_K = (2 * Math.PI) / 11;
const PENROSE_DIRS = [0, 1, 2, 3, 4].map((j) => [Math.cos((j * 2 * Math.PI) / 5), Math.sin((j * 2 * Math.PI) / 5)]);
export const penrose = (x, y) => PENROSE_DIRS.reduce((s, [dx, dy]) => s + Math.cos((x * dx + y * dy) * PENROSE_K), 0);

// Smooth (cosine) interpolation through [x, y] control points.
function curveAt(pts, x) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (1 - Math.cos((Math.PI * (x - x0)) / (x1 - x0)))) / 2;
  }
  return pts.at(-1)[1];
}

// The skin's hem sweeps up into an arch over the entrance and dips toward the street on
// either side, like the real building's undulating lower edge.
const HEM = [[0, 136], [20, 130], [48, 104], [86, 95], [118, 101], [144, 117]];
const SKIN_TOP = 23;

// Salesforce Transit Center, 144x160: the park's trees and railing on the roof, the pearl-white
// perforated skin bulging in and out, and under its arch the Grand Hall's lit glass with white
// branching struts. The gondola's cable climbs the left side.
export function drawTransitFacade(ctx) {
  const { w: W, h: H, door: D } = FACADE;
  const r = rng(77);
  // The Grand Hall, set back under the skin: warm light, a dark ceiling band, mullions.
  for (let y = 88; y < H - 2; y++) rect(ctx, 0, y, W, 1, mix('#f3d7a4', '#c3915a', (y - 88) / (H - 90)));
  for (let x = 0; x < W; x++) rect(ctx, x, Math.round(curveAt(HEM, x)), 1, 4, '#3b362f');
  for (let x = 6; x < W; x += 13) if (Math.abs(x - D) > 12) rect(ctx, x, 96, 1, H - 98, '#4d463d');
  for (let x = 0; x < W; x++) if ((x + 139) % 37 < 2) line(ctx, x, 132, Math.min(W - 1, x + 14), H - 4, '#fff6e2');
  rect(ctx, 0, H - 2, W, 2, '#2a2119');
  // Entrance: header with the door sensor, sidelights, threshold (the hq_door panels slide here).
  rect(ctx, D - 22, 124, 44, 6, '#2c241d');
  rect(ctx, D - 22, 124, 44, 1, '#54473b');
  rect(ctx, D - 1, 126, 2, 1, '#58a6ff');
  for (const x of [D - 22, D - 11, D + 10, D + 21]) rect(ctx, x, 130, 1, H - 132, '#3a3430');
  rect(ctx, D - 10, H - 2, 20, 1, '#6b4a2f');
  rect(ctx, D - 10, H - 1, 20, 1, '#a39684');
  ctx.save();
  ctx.translate(124, H - 34);
  drawPlant(ctx);
  ctx.restore();
  // White branching struts holding up the skin, clear of the doors.
  for (const [foot, l, rr] of [[56, 44, 66], [128, 116, 140]]) {
    for (const top of [l, rr]) {
      const y1 = Math.round(curveAt(HEM, top)) + 2;
      for (let k = 0; k < 3; k++) line(ctx, foot - 1 + k, H - 3, top - 1 + k, y1, ['#fbf8f1', '#e2ddd2', '#b8b2a6'][k]);
    }
    rect(ctx, foot - 3, H - 4, 7, 2, '#8d877c');
  }

  // Park on the roof: tree canopies (one palm), lamps, and the white railing along the edge.
  for (let i = 0; i < 9; i++) {
    const cx = 6 + i * 17 + Math.floor(r() * 6);
    const ry = 6 + Math.floor(r() * 5);
    fillEllipse(ctx, cx, 20 - ry / 2, 10, ry, '#1f3326');
    fillEllipse(ctx, cx - 2, 18 - ry / 2 - 2, 6, Math.max(2, ry - 4), '#2f4a36');
    rect(ctx, cx - 4, 16 - ry / 2 - 2, 2, 1, '#48684f');
  }
  line(ctx, 96, 20, 98, 2, '#4a3b2c');
  for (const [dx, dy] of [[-8, 4], [-6, 1], [7, 3], [6, 0], [1, -1]]) line(ctx, 98, 2, 98 + dx, 2 + dy, '#2f4a36');
  for (const x of [34, 112]) {
    rect(ctx, x, 8, 1, 14, '#3a3a40');
    rect(ctx, x - 1, 7, 3, 2, '#f5d0a0');
  }
  rect(ctx, 0, SKIN_TOP - 4, W, 1, '#f2efe8');
  for (let x = 1; x < W; x += 5) rect(ctx, x, SKIN_TOP - 3, 1, 3, '#cfcac0');

  // The skin: shaded as it bulges toward the light and falls back, punched with the rosettes,
  // uplit warm near the hem, with a bright lip and a dark underside along the hem itself.
  for (let x = 0; x < W; x++) {
    const hem = Math.round(curveAt(HEM, x));
    const bulge = 0.5 + 0.5 * Math.sin(x / 13 + 0.9);
    for (let y = SKIN_TOP; y < hem; y++) {
      const lit = Math.round(bulge * 4) / 4;
      let c = mix('#9d9a94', '#e4e1da', lit);
      c = mix(c, '#ffe7c2', Math.max(0, 1 - (hem - y) / 14) * 0.35);
      const q = penrose(x + 3, y + 11);
      const hole = (x % 2 === 0 && y % 2 === 0 && q > 0.9) || (x % 2 === 1 && y % 2 === 1 && q > 2.4);
      if (hole) c = mix('#46454c', '#716f76', lit);
      if (y === SKIN_TOP) c = '#fbf9f4';
      if (y === hem - 2) c = '#fff8ea';
      if (y === hem - 1) c = '#77736b';
      rect(ctx, x, y, 1, 1, c);
    }
  }

  // Gondola cable up the left side, with a cabin partway up.
  line(ctx, 2, H - 2, 38, SKIN_TOP, '#3a3a40');
  line(ctx, 5, H - 2, 41, SKIN_TOP, '#5a5a62');
  paintGondola(ctx, 10, 90);
}

// Salesforce Tower's base, 144x160: pale glass that holds the dusk sky, striped by pearl-white
// fins; on the left the big rounded corner turns away, its fins crowding together and darkening
// as it goes. Below, a double-height lobby with a giant LED wall (a friendly blue cloud).
const CORNER = 30; // the rounded corner's radius, seen face-on
const FIN = 6; // fin pitch along the glass; each fin is 2px, lit edge and shade
// Distance along the glass: fins are evenly spaced on the surface, so they bunch up in
// projection where the corner turns away.
const turn = (x) => (x < CORNER ? Math.asin(Math.min(1, (CORNER - x) / CORNER)) : 0);
const along = (x) => (x < CORNER ? CORNER * (1 - turn(x)) : x);
export function drawTowerLobby(ctx) {
  const { w: W, h: H, door: D } = FACADE;
  const r = rng(61);
  for (let x = 0; x < W; x++) {
    const away = 1 - Math.cos(turn(x)); // 0 face-on, 1 at the silhouette
    const edge = Math.floor(along(x) / FIN) !== Math.floor(along(x + 1) / FIN);
    const shade = Math.floor(along(x - 1) / FIN) !== Math.floor(along(x) / FIN);
    const glint = away > 0.12 && away < 0.3; // the curve catches the sky in one vertical streak
    for (let y = 0; y < SOFFIT; y++) {
      const sky = 1 - y / SOFFIT;
      let c = mix('#3b4658', '#6c7088', sky);
      if (edge) c = mix('#8a91a0', '#bcc0cc', sky);
      else if (shade) c = mix('#5f6778', '#8e92a6', sky);
      else if (y % 13 === 12) c = mix(c, '#1f2530', 0.5); // floor slab behind the glass
      if (glint) c = mix(c, '#d8dcef', 0.3);
      c = mix(c, '#141820', away ** 0.6 * 0.8);
      rect(ctx, x, y, 1, 1, c);
    }
  }
  // Offices still lit in runs along a floor (someone is always closing a deal).
  for (let f = 0; f * 13 < SOFFIT - 13; f++) {
    let run = 0;
    for (let x = CORNER; x < W - FIN; x++) {
      if (x % FIN !== FIN - 1) continue; // a fin's lit edge: the pane starts after its shade
      if (!run && r() < 0.08 + 0.02 * f) run = 1 + Math.floor(r() * 4);
      if (run) {
        rect(ctx, x + 2, f * 13 + 3, FIN - 2, 8, '#e8c890');
        rect(ctx, x + 2, f * 13 + 3, FIN - 2, 1, '#fff0c8');
        run--;
      }
    }
  }
  lobby(ctx, W, H, D, {
    lightTop: '#eef4f7',
    lightLow: '#9fb3bd',
    glass: '#ffffff',
    frame: '#2d3640',
    soffit: ['#f2f4f5', '#c3ccd2'],
  });
  light(ctx, 0, SOFFIT, CORNER, H, '#141820', (x) => (1 - Math.cos(turn(x))) ** 0.6 * 0.6); // the lobby rounds the corner too
  // LED wall: a blue screen with a white cloud.
  rect(ctx, D - 30, 131, 60, 22, '#1f6fb5');
  rect(ctx, D - 30, 131, 60, 1, '#58a6ff');
  for (const [cx, cy, rx, ry] of [[D - 8, 143, 7, 5], [D, 140, 8, 7], [D + 9, 143, 7, 5], [D + 1, 146, 14, 3]]) fillEllipse(ctx, cx, cy, rx, ry, '#f5f7fa');
  ctx.save();
  ctx.translate(18, H - 34);
  drawPlant(ctx);
  ctx.restore();
}

// Gondola cabin (32x30 texture): grip arm on top, cream body with an orange stripe, dark glass.
function paintGondola(ctx, ox, oy) {
  rect(ctx, ox + 15, oy, 2, 6, '#5a5a62');
  rect(ctx, ox + 11, oy, 10, 2, '#8a8a92');
  rect(ctx, ox + 2, oy + 6, 28, 2, '#8f8b83');
  rect(ctx, ox + 1, oy + 8, 30, 20, '#e8e4dc');
  rect(ctx, ox + 1, oy + 8, 30, 1, '#f7f4ee');
  for (let x = ox + 3; x < ox + 29; x += 7) {
    rect(ctx, x, oy + 10, 6, 8, '#2d3b45');
    rect(ctx, x, oy + 10, 2, 1, '#8fb4c8');
  }
  rect(ctx, ox + 1, oy + 20, 30, 2, '#d97757');
  rect(ctx, ox + 1, oy + 27, 30, 1, '#6e6a62');
  rect(ctx, ox, oy + 9, 1, 18, '#b9b4aa');
  rect(ctx, ox + 31, oy + 9, 1, 18, '#b9b4aa');
}

export function drawGondola(ctx) {
  paintGondola(ctx, 0, 0);
}

// ---- Park landmarks, in the real map's order walking west from the gondola ----

// A glass dome glowing from the hall below: steel ribs (meridians and rings) over lit panes,
// on a drum of tall glass (the Oculus has one, the West Skylight is dome only).
function dome(ctx, cx, base, rx, ry, drum) {
  const top = base - ry;
  for (let y = top; y <= base; y++) {
    const t = (y - top) / ry;
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2)));
    for (let x = cx - half; x <= cx + half; x++) {
      const u = (x - cx) / Math.max(1, half); // -1..1 across this row
      const meridian = Math.abs(Math.asin(Math.max(-1, Math.min(1, u))) * 5) % 1 < 0.14;
      const ring = [0.3, 0.6, 0.85].some((k) => y === top + Math.round(ry * k));
      let c = mix('#f2fbff', '#a9d6ee', t * 0.7 + Math.abs(u) * 0.3);
      if (meridian || ring || Math.abs(x - cx) === half) c = '#5f6f7d';
      rect(ctx, x, y, 1, 1, c);
    }
  }
  if (!drum) return;
  const [w, h] = drum;
  for (let y = base + 1; y <= base + h; y++) {
    for (let x = cx - w; x <= cx + w; x++) {
      const post = (x - cx + w) % 6 === 0 || Math.abs(x - cx) === w;
      rect(ctx, x, y, 1, 1, post ? '#6d7d8a' : mix('#eef8ff', '#b3dcf2', (y - base) / h));
    }
  }
  rect(ctx, cx - w - 1, base + h + 1, w * 2 + 3, 2, '#4a525a');
}

// The Light Column's Oculus: the Grand Hall's skylight, a lit dome on a glass drum.
export function drawOculus(ctx) {
  dome(ctx, 32, 13, 28, 13, [26, 10]);
}

// The West Skylight: a low oval dome set in the lawn.
export function drawSkylight(ctx) {
  dome(ctx, 22, 12, 20, 11, null);
  rect(ctx, 1, 13, 43, 1, '#4a525a');
}

// The cafe by the Main Plaza: a dark green pavilion with a white roof edge, a green canopy and
// a warm glass front.
export function drawCafe(ctx) {
  rect(ctx, 0, 0, 48, 3, '#dfe3dc');
  rect(ctx, 1, 3, 46, 29, '#1f3a2c');
  for (let y = 12; y < 32; y++) rect(ctx, 6, y, 36, 1, mix('#f3d7a4', '#c3915a', (y - 12) / 20));
  for (const x of [6, 18, 30, 41]) rect(ctx, x, 12, 1, 20, '#2a2620');
  rect(ctx, 20, 20, 3, 4, '#4a3020'); // a barista, mid-pour
  rect(ctx, 20, 18, 2, 2, '#4a3020');
  rect(ctx, 0, 8, 48, 3, '#3d7a4a');
  rect(ctx, 0, 11, 48, 1, '#23452b');
  for (let x = 1; x < 48; x += 4) rect(ctx, x, 8, 2, 1, '#5aa06a');
}

// Children's play area: a red rope net pyramid around a steel mast, on spongy rubber.
export function drawPlayFrame(ctx) {
  const ROPE = '#c0463c';
  const H = 40;
  rect(ctx, 21, 0, 2, H, '#8a8f98');
  rect(ctx, 20, 0, 4, 2, '#c9ced6');
  for (const foot of [1, 11, 32, 42]) line(ctx, 22, 3, foot, H - 3, ROPE);
  for (const y of [12, 20, 28]) {
    const reach = ((y - 3) / (H - 6)) * 21; // the net widens toward the ground
    line(ctx, Math.round(22 - reach), y, Math.round(22 + reach), y, ROPE);
  }
  const FLOOR = ['#e07a3c', '#3fa8a0', '#e3b341', '#3fa8a0'];
  for (let x = 0; x < 44; x++) rect(ctx, x, H - 2, 1, 2, FLOOR[Math.floor(x / 11) % FLOOR.length]);
}

// Amphitheater: the building behind the stage, clad in panels of terracotta stripes, with a
// white band along the top. Dimmed for dusk so demo day's fight reads in front of it.
export function drawAmphiWall(ctx) {
  const W = 192;
  const H = 128;
  const STRIPES = ['#5e3826', '#6c412b', '#784c33', '#855a3c'];
  rect(ctx, 0, 0, W, 10, '#9d988d');
  rect(ctx, 0, 10, W, 1, '#6e695f');
  for (let y = 11; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = Math.floor(x / 24);
      const py = Math.floor((y - 11) / 30);
      const frame = x % 24 === 0 || (y - 11) % 30 === 0;
      const band = Math.floor((y - 11 + px * 5 + py * 3) / 3) % STRIPES.length;
      rect(ctx, x, y, 1, 1, frame ? '#a39986' : STRIPES[band]);
    }
  }
}

// Lawn chairs for the audience, seen from behind as they face the stage: red, blue, yellow,
// orange and green.
export function drawChairs(ctx) {
  const COLORS = ['#e5534b', '#3b6fd8', '#e3b341', '#f07f3c', '#3fb950'];
  const r = rng(1000);
  for (let x = 0; x + 5 <= 96; x += 7) {
    const c = COLORS[Math.floor(r() * COLORS.length)];
    rect(ctx, x, 0, 5, 3, c); // back
    rect(ctx, x, 3, 1, 1, c);
    rect(ctx, x + 4, 3, 1, 1, c);
    rect(ctx, x, 4, 5, 1, mix(c, '#000000', 0.3)); // seat edge
    rect(ctx, x, 5, 1, 3, '#2d2d2d');
    rect(ctx, x + 4, 5, 1, 3, '#2d2d2d');
  }
}

export const PARK_ART = {
  transit_facade: { w: FACADE.w, h: FACADE.h, draw: drawTransitFacade },
  tower_lobby: { w: FACADE.w, h: FACADE.h, draw: drawTowerLobby },
  gondola: { w: 32, h: 28, draw: drawGondola },
  oculus: { w: 64, h: 27, draw: drawOculus },
  skylight: { w: 45, h: 14, draw: drawSkylight },
  cafe: { w: 48, h: 32, draw: drawCafe },
  play_frame: { w: 44, h: 40, draw: drawPlayFrame },
  amphi_wall: { w: 192, h: 128, draw: drawAmphiWall },
  chairs: { w: 96, h: 8, draw: drawChairs },
};

export function buildParkTextures(scene) {
  for (const [key, { w, h, draw }] of Object.entries(PARK_ART)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    hardenAlpha(ctx, w, h);
    tex.refresh();
  }
}
