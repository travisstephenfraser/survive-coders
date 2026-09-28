// Procedural pixel art for the fall from the Salesforce Tower (the Chute) and the landing after
// it: the tower seen close up, the Transit Center's roof at the bottom of the fall, the CRM
// dashboard Claude ships as a parachute, the real canopy and its paywalled pack, and the SoMa
// rooftops and street the canopy comes down over.

import { TOWER_BANDS } from './backdrops.js';
import { fillEllipse, hardenAlpha, line, mix, rect, rng } from './hqArt.js';
import { penrose } from './parkArt.js';

// ---------------------------------------------------------------------------------------------
// Salesforce Tower, close up. drawSalesforceTower's profile at 7x: a rounded-square obelisk
// whose sides run straight for the lower 42%, then curve in, ever faster, to half the base's
// width at the top. The crown is the LED lattice (the skyline's bands, cell by cell), then the
// dark open floors with their lit bracing and the lit strip down the face, then the Ohana Floor
// (61) with its living walls and the pane the leap broke, then offices to the street. The glass
// and fins are the tower lobby's (parkArt.js), so the building is one building top to bottom.

export const TOWER = { w: 180, h: 980, cx: 90, base: 84, crown: 112, storey: 14 };
const DARK = 28; // unlit open floors between the crown and the Ohana Floor
export const OHANA = { top: TOWER.crown + DARK, h: 18 };
const OFFICES = OHANA.top + OHANA.h;
const FIN = 6; // fin pitch along the glass, as on the lobby
const R = 12; // the crown's rounded top corners

// Half-width of the tower at texture row y.
export function towerHalf(y) {
  const t = (TOWER.h - y) / TOWER.h; // 0 at the street, 1 at the top
  const curve = t < 0.42 ? 0 : ((t - 0.42) / 0.58) ** 2;
  const round = y < R ? R - Math.sqrt(R * R - (R - y) ** 2) : 0;
  return Math.round(TOWER.base * (1 - curve / 2) - round);
}

// Where a pixel `a` px from the centreline sits on the rounded-square plan: `s` is the distance
// along the glass (fins are evenly spaced in s, so they crowd where the corner turns away), and
// `away` is 0 face-on and 1 at the silhouette.
function surface(a, hw) {
  const rc = Math.max(6, hw * 0.35);
  const flat = hw - rc;
  if (a <= flat) return { s: a, away: 0 };
  const turn = Math.asin(Math.min(1, (a - flat) / rc));
  return { s: flat + rc * turn, away: 1 - Math.cos(turn) };
}

const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const blend = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;
const C = Object.fromEntries(
  Object.entries({
    glassLo: '#3b4658', glassHi: '#6c7088', finLo: '#8a91a0', finHi: '#bcc0cc', shadeLo: '#5f6778', shadeHi: '#8e92a6',
    slab: '#1f2530', night: '#141820', sunset: '#b8604a', rim: '#d0785e', shadow: '#101018',
    frame: '#241f2c', deadCell: '#3a3040', crownDark: '#15121c', open: '#1a1824', openFloor: '#2a2636', brace: '#3f55a8',
    strip: '#39c5cf', stripDim: '#2e6d78', ceiling: '#fff4dc', room: '#e2b87a', mullion: '#3a3f47', slab61: '#2a2b30',
    cove: '#8f8a80', person: '#4a3020', white: '#ffffff', glintCool: '#d8dcef', glintWarm: '#ffd9b0',
  }).map(([k, v]) => [k, rgb(v)]),
);
const BANDS = TOWER_BANDS.map(rgb);
// A lit office's ceiling light, room and desks: warm, or the odd cool-white one (hqArt's litPane).
const ROOMS = [
  ['#fff0c4', '#e9b56b', '#b27b3e'],
  ['#f2f7f2', '#c8dcd6', '#8aa5a0'],
].map((room) => room.map(rgb));
const LAMP = rgb('#3a2a1c'); // a desk lamp rather than the ceiling lights
const LEAVES = ['#2d5a2f', '#3f7a3a', '#5a9a4a', '#79b85a'].map(rgb);

export function drawChuteTower(ctx) {
  const { w: W, h: H, cx, crown: CROWN, storey: STOREY } = TOWER;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const r = rng(415); // 415 Mission St
  // Offices lit in runs along each floor: one flag per floor, side of the centreline, fin bay.
  const floors = Math.ceil((H - OFFICES) / STOREY);
  const lit = new Uint8Array(floors * 64);
  for (let f = 0; f < floors; f++) {
    for (const half of [0, 32]) {
      let run = 0;
      for (let k = 0; k < 32; k++) {
        if (!run && r() < 0.05) run = 1 + Math.floor(r() * 4);
        if (run) {
          lit[f * 64 + half + k] = 1;
          run--;
        }
      }
    }
  }
  const notch = [0, 1, 3, 2, 4, 2, 1, 3, 2, 1, 2, 0]; // the broken pane, rows 3..14 of floor 61

  for (let y = 0; y < H; y++) {
    const hw = towerHalf(y);
    const sky = 1 - y / H; // glass higher up holds more of the dusk
    for (let x = cx - hw; x < cx + hw; x++) {
      const side = x < cx ? -1 : 1;
      const a = Math.abs(x + 0.5 - cx);
      const { s, away } = surface(a, hw);
      const sOut = surface(a + 1, hw).s;
      const sIn = surface(Math.abs(a - 1), hw).s;
      const edge = Math.floor(s / FIN) !== Math.floor(sOut / FIN);
      const shade = Math.floor(sIn / FIN) !== Math.floor(s / FIN);
      const yy = y - OHANA.top;
      if (side > 0 && yy >= 3 && yy < 15 && x >= cx + hw - 3 - notch[yy - 3]) continue; // the way out
      let c;
      if (y < CROWN) {
        // The LED lattice: a cell per 4px of glass and 3 rows, lit in the skyline's bands.
        if (y % 3 === 0 || Math.floor(s / 4) !== Math.floor(sOut / 4)) c = C.frame;
        else {
          const n = hash(Math.floor(s / 4) * side + 50, Math.floor(y / 3));
          const band = BANDS[Math.min(BANDS.length - 1, Math.floor(y / (CROWN / BANDS.length)))];
          c = n < 0.1 ? C.deadCell : n > 0.85 ? blend(band, C.white, 0.3) : band;
        }
        c = blend(c, C.crownDark, away ** 0.6 * 0.7);
      } else if (y < OHANA.top) {
        // The open floors under the crown: dark, the bracing lit blue, the lit strip down the middle.
        const yo = y - CROWN;
        const sI = Math.floor(s);
        c = yo % 9 === 8 ? C.openFloor : C.open;
        if ((sI + yo) % 14 === 0 || (sI - yo + 1400) % 14 === 0) c = C.brace;
        if (a < 2 && yo % 3) c = C.strip;
        c = blend(c, C.crownDark, away ** 0.6 * 0.7);
      } else if (y < OFFICES) {
        // Floor 61, the Ohana Floor: lit glass to the ceiling, living walls, people.
        if (yy === 0) c = C.cove;
        else if (yy >= OHANA.h - 2) c = C.slab61;
        else if (Math.floor(s / 8) !== Math.floor(sOut / 8)) c = C.mullion;
        else if ((Math.floor(s) + 4) % 28 < 3) c = LEAVES[Math.floor(hash(x, y) * LEAVES.length)];
        else if ((Math.floor(s) + 17) % 45 < 2 && yy >= 8) c = yy < 10 ? blend(C.person, C.room, 0.2) : C.person;
        else c = blend(C.ceiling, C.room, yy / OHANA.h);
        c = blend(c, C.night, away ** 0.6 * 0.6);
      } else {
        // Offices: the lobby's glass and fins, a slab line per floor, some rooms still lit.
        const f = Math.floor((y - OFFICES) / STOREY);
        const fy = (y - OFFICES) % STOREY;
        const bay = Math.min(31, Math.floor(s / FIN));
        const glass = blend(C.glassLo, C.glassHi, sky);
        // Where the corner turns away the fins crowd together; they fade into the glass there
        // rather than shimmer under the CRT filter.
        const crowd = Math.min(1, away * 1.6);
        c = glass;
        if (edge) c = blend(blend(C.finLo, C.finHi, sky), glass, crowd);
        else if (shade) c = blend(blend(C.shadeLo, C.shadeHi, sky), glass, crowd);
        else if (fy === STOREY - 1) c = blend(c, C.slab, 0.5);
        else if (fy >= 3 && fy < STOREY - 3 && lit[f * 64 + (side > 0 ? 32 : 0) + bay]) {
          const n = hash(f * 7 + 3, bay * side + 40);
          const [ceiling, room, desks] = ROOMS[n < 0.2 ? 1 : 0];
          c = fy === 3 ? ceiling : fy >= STOREY - 5 ? desks : room;
          if (n > 0.7) c = blend(c, LAMP, 0.3);
        }
        if (a < 2 && f < 4 && fy % 3) c = C.stripDim; // the strip's last lit panels
        // The corner catches the sky in one vertical streak: cool on the shaded side, warm on the sun's.
        if (away > 0.12 && away < 0.3) c = blend(c, side > 0 ? C.glintWarm : C.glintCool, 0.3);
        // The sun is to the right: that corner stays lit and warms; the left one falls to night.
        if (side > 0) c = blend(blend(c, C.night, away ** 0.6 * 0.45), C.sunset, away * 0.3);
        else c = blend(c, C.night, away ** 0.6 * 0.8);
      }
      if (x === cx + hw - 1) c = y < CROWN ? blend(c, C.rim, 0.5) : C.rim;
      else if (x === cx - hw) c = C.shadow;
      const i = (y * W + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Cracks radiating from the broken pane.
  const hx = cx + towerHalf(OHANA.top + 8) - 4;
  const hy = OHANA.top + 9;
  for (const [dx, dy] of [[-6, -6], [-7, 2], [-4, 7], [-9, -1]]) line(ctx, hx - 1, hy, hx + dx, hy + dy, '#f5f5f5');
}

// ---------------------------------------------------------------------------------------------
// The Transit Center's roof, beside the tower: the park's trees and lamps over the white railing,
// then the perforated skin (drawTransitFacade's), bulging in and out. The fall ends at ROOF.

export const ROOF = 19; // the railing line, where a missing parachute ends the fall
export function drawTransitRoof(ctx) {
  const W = 160;
  const H = 72;
  const r = rng(71);
  for (let i = 0; i < 9; i++) {
    const cx = 8 + i * 18 + Math.floor(r() * 6);
    const ry = 6 + Math.floor(r() * 5);
    fillEllipse(ctx, cx, 17 - ry / 2, 10, ry, '#1f3326');
    fillEllipse(ctx, cx - 2, 15 - ry / 2 - 2, 6, Math.max(2, ry - 4), '#2f4a36');
    rect(ctx, cx - 4, 13 - ry / 2 - 2, 2, 1, '#48684f');
  }
  line(ctx, 64, 18, 66, 1, '#4a3b2c');
  for (const [dx, dy] of [[-8, 4], [-6, 1], [7, 3], [6, 0], [1, -1]]) line(ctx, 66, 1, 66 + dx, 1 + dy, '#2f4a36');
  for (const x of [40, 118]) {
    rect(ctx, x, 6, 1, 13, '#3a3a40');
    rect(ctx, x - 1, 5, 3, 2, '#f5d0a0');
  }
  rect(ctx, 0, ROOF, W, 1, '#f2efe8');
  for (let x = 1; x < W; x += 5) rect(ctx, x, ROOF + 1, 1, 3, '#cfcac0');
  for (let x = 0; x < W; x++) {
    const bulge = 0.5 + 0.5 * Math.sin(x / 13 + 0.9);
    for (let y = ROOF + 4; y < H; y++) {
      const lit = Math.round(bulge * 4) / 4;
      let c = mix('#9d9a94', '#e4e1da', lit);
      const q = penrose(x + 3, y + 11);
      if ((x % 2 === 0 && y % 2 === 0 && q > 0.9) || (x % 2 === 1 && y % 2 === 1 && q > 2.4)) c = mix('#46454c', '#716f76', lit);
      if (y === ROOF + 4) c = '#fbf9f4';
      rect(ctx, x, y, 1, 1, c);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Canopies. Both are domes with a scalloped hem; lines run from the hem to the rider.

function dome(w, h, x) {
  const u = (x + 0.5 - w / 2) / (w / 2);
  return Math.round(h * (1 - Math.sqrt(Math.max(0, 1 - u * u))));
}

// Claude's first parachute: an Agentfarce dashboard in the shape of a canopy. A blue header
// with the cloud, a bar chart, a donut, and a line chart of your altitude, trending down.
export function drawCrmCanopy(ctx) {
  const W = 64;
  const HEM = 22;
  for (let x = 0; x < W; x++) {
    const top = dome(W, HEM - 2, x);
    const scallop = 1 + Math.round(Math.sin(((x % 8) / 8) * Math.PI) * 2);
    for (let y = top; y < HEM + scallop; y++) rect(ctx, x, y, 1, 1, y < top + 6 ? '#1f6fb5' : '#f5f7fa');
    rect(ctx, x, top, 1, 1, '#58a6ff');
    rect(ctx, x, HEM + scallop - 1, 1, 1, '#b9c3cf');
  }
  for (const [cx, cy, rx, ry] of [[28, 3, 2, 1], [32, 2, 3, 2], [36, 3, 2, 1]]) fillEllipse(ctx, cx, cy, rx, ry, '#f5f7fa'); // the cloud, in the header
  for (const x of [20, 43]) rect(ctx, x, 11, 1, 11, '#d5dbe3'); // card borders
  for (const [x, h] of [[8, 3], [11, 5], [14, 7], [17, 4]]) rect(ctx, x, 21 - h, 2, h, '#58a6ff');
  fillEllipse(ctx, 31, 16, 5, 5, '#1f6fb5');
  fillEllipse(ctx, 31, 16, 2, 2, '#f5f7fa');
  for (const [x, y] of [[33, 12], [34, 13], [35, 14], [35, 15], [36, 15]]) rect(ctx, x, y, 1, 1, '#d97757');
  const pts = [[46, 13], [49, 14], [52, 13], [55, 17], [58, 20]];
  for (let i = 1; i < pts.length; i++) line(ctx, ...pts[i - 1], ...pts[i], '#e5534b');
}

// The real one: Claude orange and cream gores, shaded toward the edges, with a vent at the top.
export function drawChute(ctx) {
  const W = 56;
  const HEM = 19;
  for (let x = 0; x < W; x++) {
    const top = dome(W, HEM - 1, x);
    const u = Math.abs(x + 0.5 - W / 2) / (W / 2);
    const gore = Math.floor((x / W) * 7) % 2 ? '#f5ede0' : '#d97757';
    const scallop = Math.round(Math.sin(((x % 8) / 8) * Math.PI) * 2);
    for (let y = top; y < HEM + scallop; y++) {
      let c = mix(gore, gore === '#d97757' ? '#6b3b2b' : '#a89c88', u ** 2 * 0.55);
      if (y < top + 2) c = mix(c, '#ffffff', 0.25);
      rect(ctx, x, y, 1, 1, c);
    }
    rect(ctx, x, HEM + scallop - 1, 1, 1, '#8a4a36');
  }
  rect(ctx, W / 2 - 2, 0, 4, 1, '#2a1a14');
}

// The Parachute Pro pack (strapped to your back) and the padlock the paywall hangs on it.
export function drawChutePack(ctx) {
  rect(ctx, 0, 0, 7, 9, '#2b2f36');
  rect(ctx, 1, 1, 5, 7, '#3a3f47');
  rect(ctx, 1, 1, 5, 1, '#5d636c');
  rect(ctx, 0, 3, 7, 1, '#1a1d21');
  rect(ctx, 3, 5, 1, 2, '#d97757');
}

export function drawPadlock(ctx) {
  rect(ctx, 1, 0, 3, 1, '#c9ced6');
  rect(ctx, 1, 1, 1, 2, '#c9ced6');
  rect(ctx, 3, 1, 1, 2, '#c9ced6');
  rect(ctx, 0, 3, 5, 4, '#e3b341');
  rect(ctx, 0, 3, 5, 1, '#f5d88a');
  rect(ctx, 2, 4, 1, 2, '#6a4a10');
}

// ---------------------------------------------------------------------------------------------
// The landing: SoMa's rooftops along the street (brick warehouses, concrete offices, a glass
// tower, water tanks, HVAC boxes, antennas), and the street itself.

const WARM = '#f0c090';
function soma(ctx, x, w, h, kind, r) {
  const base = 150;
  const top = base - h;
  const body = { brick: '#5a2e26', concrete: '#55534f', glass: '#2c3645', white: '#7d7a74' }[kind];
  rect(ctx, x, top, w, h, body);
  if (kind === 'glass') {
    for (let gx = x + 2; gx < x + w - 1; gx += 4) rect(ctx, gx, top + 2, 1, h - 2, '#4a5668');
    for (let y = top + 6; y < base - 4; y += 7) {
      let run = 0;
      for (let gx = x + 3; gx < x + w - 3; gx += 4) {
        if (!run && r() < 0.12) run = 1 + Math.floor(r() * 3);
        if (run) {
          rect(ctx, gx, y, 3, 3, r() < 0.8 ? WARM : '#dfe8f0');
          run--;
        }
      }
    }
  } else {
    const [pw, ph, gap] = kind === 'brick' ? [3, 5, 10] : [3, 4, 8];
    for (let y = top + 7; y < base - 8; y += gap) {
      for (let wx = x + 3; wx < x + w - 4; wx += 6) {
        const on = r() < (kind === 'brick' ? 0.35 : 0.25);
        rect(ctx, wx, y, pw, ph, on ? WARM : kind === 'white' ? '#3a3a40' : '#2a1a18');
        if (kind === 'brick') rect(ctx, wx, y - 1, pw, 1, '#7a4632'); // brick arch
        if (kind === 'white') rect(ctx, wx - 1, y + ph, pw + 2, 1, '#b8b4ac'); // balcony
      }
    }
    if (kind === 'brick') {
      rect(ctx, x, top, w, 2, '#8a5a44'); // cornice
      // Fire escape down one side: landings and zigzag stairs.
      const fx = x + w - 12;
      for (let y = top + 12; y < base - 10; y += 10) {
        rect(ctx, fx, y, 10, 1, '#1a1a1e');
        line(ctx, fx + 1, y, fx + 9, y + 10, '#1a1a1e');
      }
    }
  }
  rect(ctx, x, top, w, 1, mix(body, '#ffffff', 0.25)); // the roof edge catches the sunset
  // Rooftop kit.
  const kit = r();
  if (kit < 0.35) {
    const tx = x + 6 + Math.floor(r() * (w - 20));
    for (const lx of [tx + 1, tx + 7]) rect(ctx, lx, top - 5, 1, 5, '#2a211b');
    rect(ctx, tx, top - 14, 9, 9, '#6a4a30');
    rect(ctx, tx, top - 14, 9, 1, '#8a6a48');
    rect(ctx, tx - 1, top - 16, 11, 2, '#4a3526');
  } else if (kit < 0.7) {
    const hx = x + 4 + Math.floor(r() * (w - 16));
    rect(ctx, hx, top - 5, 11, 5, '#4a4d55');
    rect(ctx, hx + 2, top - 4, 3, 3, '#2b2f36');
    rect(ctx, hx + 6, top - 4, 3, 3, '#2b2f36');
  }
  if (r() < 0.5) {
    const ax = x + w - 5;
    rect(ctx, ax, top - 14, 1, 14, '#34343c');
    rect(ctx, ax, top - 15, 1, 1, '#ff5a4e');
  }
}

export function drawSomaRoofs(ctx) {
  const r = rng(94103); // SoMa's ZIP
  const KINDS = ['brick', 'concrete', 'brick', 'glass', 'white', 'brick', 'concrete'];
  let x = 0;
  for (let i = 0; x < 840 - 30; i++) {
    const kind = KINDS[i % KINDS.length];
    const w = Math.min(840 - x, (kind === 'glass' ? 44 : 50) + Math.floor(r() * 40));
    const h = kind === 'glass' ? 120 + Math.floor(r() * 25) : 50 + Math.floor(r() * 60);
    soma(ctx, x, w, h, kind, r);
    x += w + 3 + Math.floor(r() * 8);
  }
}

// The street, side on: the curb's lit edge, then asphalt with a dashed lane line.
export function drawStreet(ctx) {
  rect(ctx, 0, 0, 32, 32, '#1f2127');
  rect(ctx, 0, 0, 32, 1, '#7d838c');
  rect(ctx, 0, 1, 32, 2, '#4a4e56');
  rect(ctx, 0, 9, 14, 1, '#b38a2a');
  const r = rng(3);
  for (let i = 0; i < 18; i++) rect(ctx, Math.floor(r() * 32), 4 + Math.floor(r() * 28), 1, 1, '#2a2d34');
}

// A speed line for the fall.
export function drawStreak(ctx) {
  rect(ctx, 0, 0, 1, 6, '#f5f5f5');
}

export const CHUTE_ART = {
  chute_tower: { w: TOWER.w, h: TOWER.h, draw: drawChuteTower },
  transit_roof: { w: 160, h: 72, draw: drawTransitRoof },
  crm_canopy: { w: 64, h: 26, draw: drawCrmCanopy },
  chute: { w: 56, h: 22, draw: drawChute },
  chute_pack: { w: 7, h: 9, draw: drawChutePack },
  padlock: { w: 5, h: 7, draw: drawPadlock },
  soma_roofs: { w: 840, h: 150, draw: drawSomaRoofs },
  street: { w: 32, h: 32, draw: drawStreet },
  streak: { w: 1, h: 6, draw: drawStreak },
};

export function buildChuteTextures(scene) {
  for (const [key, { w, h, draw }] of Object.entries(CHUTE_ART)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    hardenAlpha(ctx, w, h);
    tex.refresh();
  }
}
