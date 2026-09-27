// Procedural pixel art for Salesforce Park: the Transit Center seen from the street (Level 1's
// exit, the park's trees over its roof), the Salesforce Tower lobby (the park's exit), and the
// gondola that carries you up. Facades share hqArt's FACADE geometry, so the same sliding
// hq_door panels and walk-in work at every building.

import { FACADE, drawPlant, fillEllipse, hardenAlpha, line, mix, rect, rng } from './hqArt.js';

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

// Salesforce Transit Center, 144x160: the park's trees over the roof edge, the undulating white
// perforated skin, a glass lobby, and the gondola track climbing the left side.
export function drawTransitFacade(ctx) {
  const { w: W, h: H, door: D } = FACADE;
  const r = rng(77);
  // Park canopy over the roof, with a lamp.
  for (let i = 0; i < 9; i++) {
    const cx = 8 + i * 17 + Math.floor(r() * 6);
    const ry = 7 + Math.floor(r() * 5);
    fillEllipse(ctx, cx, 20 - ry / 2, 10, ry, '#1f3326');
    fillEllipse(ctx, cx - 2, 18 - ry / 2 - 2, 6, Math.max(2, ry - 4), '#2f4a36');
  }
  rect(ctx, 112, 6, 1, 16, '#3a3a40');
  rect(ctx, 110, 5, 5, 2, '#f5d0a0');
  // Roof lip.
  rect(ctx, 0, 22, W, 3, '#e8e4dc');
  rect(ctx, 0, 25, W, 1, '#6e6a62');
  // Undulating skin: shading follows a wave, with a diamond perforation grid.
  for (let y = 26; y < SOFFIT; y++) {
    for (let x = 0; x < W; x++) {
      const wave = Math.sin((x + y * 0.35) / 11);
      const base = mix('#96918a', '#4e4a45', Math.round((0.5 - wave * 0.5) * 6) / 6);
      const d = (x + y) % 6;
      const e = (x - y + 600) % 6;
      let c = base;
      if (d === 3 && e === 3) c = mix(base, '#2a2824', 0.45);
      else if (d === 0 || e === 0) c = mix(base, '#f2efe8', 0.1);
      rect(ctx, x, y, 1, 1, c);
    }
  }
  lobby(ctx, W, H, D, {
    lightTop: '#f6e2b8',
    lightLow: '#c89a62',
    glass: '#fff3d6',
    frame: '#3a3430',
    soffit: ['#ece5d7', '#c9c1b0'],
  });
  ctx.save();
  ctx.translate(112, H - 34);
  drawPlant(ctx);
  ctx.restore();
  // Gondola track up the left side, with a cabin partway up.
  line(ctx, 2, H - 2, 38, 24, '#3a3a40');
  line(ctx, 5, H - 2, 41, 24, '#5a5a62');
  paintGondola(ctx, 10, 96);
}

// Salesforce Tower's base, 144x160: pale glass between white fins, a rounded corner, and a
// double-height lobby with a giant LED wall (a friendly blue cloud) behind the doors.
export function drawTowerLobby(ctx) {
  const { w: W, h: H, door: D } = FACADE;
  const r = rng(61);
  for (let y = 0; y < SOFFIT; y++) {
    for (let x = 0; x < W; x++) {
      const corner = x < 16 ? (16 - x) / 16 : 0; // rounded corner: darker as it turns away
      let c = mix(mix('#5d7085', '#34424f', y / SOFFIT), '#1c232b', corner * 0.8);
      if (x % 6 === 0) c = mix('#d6dade', '#8d959d', corner);
      else if (x % 6 === 1) c = mix('#9aa1a8', '#5a6068', corner);
      if (y % 13 === 0) c = mix(c, '#20272e', 0.5);
      rect(ctx, x, y, 1, 1, c);
    }
  }
  // A few offices still lit (someone is always closing a deal).
  for (let f = 0; f * 13 < SOFFIT - 13; f++) {
    for (let x = 20; x < W; x += 6) {
      if (r() < 0.12) rect(ctx, x + 2, f * 13 + 3, 4, 8, r() < 0.5 ? '#ffe7b0' : '#dff1ff');
    }
  }
  lobby(ctx, W, H, D, {
    lightTop: '#eef4f7',
    lightLow: '#9fb3bd',
    glass: '#ffffff',
    frame: '#2d3640',
    soffit: ['#f2f4f5', '#c3ccd2'],
  });
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

export const PARK_ART = {
  transit_facade: { w: FACADE.w, h: FACADE.h, draw: drawTransitFacade },
  tower_lobby: { w: FACADE.w, h: FACADE.h, draw: drawTowerLobby },
  gondola: { w: 32, h: 28, draw: drawGondola },
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
