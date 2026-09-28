// Procedural pixel art for the ride to Anthropic HQ (Ride): the back seat of a Waymo, drawn from
// Travis's photos of one. Two layers with the steering wheel between them: the cabin behind it
// (the panoramic roof, the windshield and its mirror, the dash and its map screen, the console),
// and in front of it the two empty front seats, their mesh pockets, and the rider screen between
// them. The windows are holes: the Ride scene draws the street behind them every frame.

import { fillEllipse, fillPoly, line, mix, rect } from './hqArt.js';

// Where things are in the 320x180 view, shared with the Ride scene.
export const CAB = {
  roof: [[34, 0], [286, 0], [280, 27], [40, 27]], // the glass over your head
  windshield: [[106, 41], [214, 41], [232, 81], [88, 81]],
  left: [[16, 36], [50, 34], [58, 81], [14, 81]], // the side windows
  right: [[270, 34], [304, 36], [306, 81], [262, 81]],
  wheel: { x: 118, y: 93 },
  screen: { x: 125, y: 127, w: 70, h: 38 }, // the rider screen's glass
  button: { x: 133, y: 145, w: 54, h: 12 }, // START RIDE
};

const TRIM = '#17181c';
const DASH = '#111215';
const SILVER = '#7d828c';
const LEATHER = '#24252a';
const LEATHER_LIT = '#303238';
const RIM = '#43464e'; // light catching the seats' edges
const SEAM = '#2c2e33';
const BEZEL = '#0b0c0e';

// Cut a window: whatever the polygon covers becomes transparent.
function hole(ctx, pts) {
  ctx.globalCompositeOperation = 'destination-out';
  fillPoly(ctx, pts, '#000');
  ctx.globalCompositeOperation = 'source-over';
}

// A rectangle with rounded corners of radius r, one pixel row at a time; `color` can be a
// function of the row, for shading.
function roundRect(ctx, x, y, w, h, r, color) {
  for (let j = 0; j < h; j++) {
    const dy = j < r ? r - j - 0.5 : j >= h - r ? j - (h - r) + 0.5 : 0;
    const inset = dy ? Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy))) : 0;
    rect(ctx, x + inset, y + j, w - inset * 2, 1, typeof color === 'function' ? color(j) : color);
  }
}

export function drawRideCabin(ctx) {
  rect(ctx, 0, 0, 320, 180, TRIM);
  // Headliner, lighter toward the windshield; the A-pillars between it and the side windows.
  for (let y = 28; y < 41; y++) rect(ctx, 0, y, 320, 1, mix('#1b1c21', '#26272d', (y - 28) / 13));
  fillPoly(ctx, [[50, 34], [106, 41], [88, 81], [58, 81]], '#1f2025');
  fillPoly(ctx, [[270, 34], [214, 41], [232, 81], [262, 81]], '#1f2025');
  hole(ctx, CAB.roof);
  line(ctx, 40, 27, 280, 27, '#0c0d10');
  line(ctx, 40, 28, 280, 28, '#2c2e34');
  rect(ctx, 56, 31, 10, 2, '#3a3c42'); // grab handles
  rect(ctx, 254, 31, 10, 2, '#3a3c42');
  // The console hanging from the roof: the car's cabin sensors, a status light, the mirror's stem.
  fillPoly(ctx, [[138, 0], [182, 0], [178, 22], [142, 22]], '#1d1e23');
  rect(ctx, 150, 12, 20, 3, BEZEL);
  rect(ctx, 158, 13, 4, 1, '#39c5cf');
  hole(ctx, CAB.windshield);
  hole(ctx, CAB.left);
  hole(ctx, CAB.right);
  // The mirror, hung in the windshield's top edge: in it, your own eyes.
  rect(ctx, 159, 22, 2, 22, '#1d1e23');
  rect(ctx, 147, 44, 26, 8, BEZEL);
  rect(ctx, 148, 45, 24, 6, '#2a2f3a');
  rect(ctx, 157, 46, 6, 2, '#5a3a2a');
  rect(ctx, 157, 48, 6, 2, '#f2c29b');
  rect(ctx, 158, 48, 1, 1, '#0d0d0d');
  rect(ctx, 161, 48, 1, 1, '#0d0d0d');
  // The dash, its top edge catching the street's light.
  fillPoly(ctx, [[88, 81], [232, 81], [262, 114], [58, 114]], DASH);
  line(ctx, 88, 81, 232, 81, '#2b2d33');
  rect(ctx, 100, 84, 32, 8, '#050506'); // the instrument display behind the wheel
  rect(ctx, 104, 87, 8, 1, '#2f6f78');
  rect(ctx, 120, 87, 8, 1, '#2f6f78');
  for (const x of [150, 172]) {
    rect(ctx, x, 84, 18, 3, '#050506'); // vents
    rect(ctx, x, 84, 18, 1, SILVER);
  }
  // The dash screen: the route across a light map, and the orange dot at the end of it.
  rect(ctx, 151, 89, 38, 12, '#050506');
  rect(ctx, 152, 90, 36, 10, '#e7ebf1');
  line(ctx, 153, 98, 163, 93, '#c7cdd8');
  line(ctx, 164, 99, 178, 91, '#c7cdd8');
  line(ctx, 156, 97, 166, 93, '#3b82f6');
  line(ctx, 166, 93, 180, 95, '#3b82f6');
  rect(ctx, 180, 94, 2, 2, '#f59e0b');
  rect(ctx, 156, 104, 28, 6, '#050506'); // climate
  for (const x of [159, 166, 173, 180]) rect(ctx, x, 106, 2, 1, '#8fd0ff');
  // The console running back between the seats, silver-edged, and the drive selector's keys.
  fillPoly(ctx, [[146, 112], [174, 112], [186, 132], [134, 132]], '#1a1b1f');
  line(ctx, 146, 112, 134, 132, SILVER);
  line(ctx, 174, 112, 186, 132, SILVER);
  for (const [x, y] of [[155, 117], [161, 117], [158, 121], [164, 121]]) rect(ctx, x, y, 3, 2, '#2c2e34');
}

// A front seat from behind: a rounded headrest over a back whose shoulder drops away toward the
// console (so the wheel shows over the driver's), stitched bolsters, light along its edges, and a
// mesh pocket.
function seat(ctx, flip) {
  const X = (x) => (flip ? 320 - x : x);
  const P = (pts) => pts.map(([x, y]) => [X(x), y]);
  const back = [[12, 180], [12, 102], [22, 86], [38, 78], [96, 78], [102, 92], [112, 108], [128, 116], [138, 126], [138, 180]];
  fillPoly(ctx, P(back), LEATHER);
  fillPoly(ctx, P([[14, 180], [14, 103], [23, 88], [30, 84], [30, 180]]), LEATHER_LIT); // outer bolster
  for (let i = 1; i < back.length - 1; i++) line(ctx, X(back[i][0]), back[i][1], X(back[i + 1][0]), back[i + 1][1], RIM);
  line(ctx, X(30), 86, X(30), 179, SEAM);
  line(ctx, X(124), 120, X(124), 179, SEAM);
  const hx = flip ? 320 - 98 : 36;
  roundRect(ctx, hx - 1, 37, 64, 43, 12, RIM); // the rim, then the headrest inside it
  roundRect(ctx, hx, 38, 62, 41, 11, (j) => (j < 14 ? mix(LEATHER_LIT, LEATHER, j / 14) : LEATHER)); // lit from above
  rect(ctx, hx + 6, 78, 50, 1, '#141518'); // where it meets the back
  // The mesh pocket.
  const px = flip ? 320 - 120 : 28;
  roundRect(ctx, px, 146, 92, 34, 3, '#141518');
  for (let y = 148; y < 180; y++) for (let x = px + 2; x < px + 90; x++) if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) rect(ctx, x, y, 1, 1, '#25272c');
  rect(ctx, px, 146, 92, 1, '#2e3035');
}

export function drawRideSeats(ctx) {
  seat(ctx, false);
  seat(ctx, true);
  // "Hello!", tucked in the passenger seat's pocket (the scene writes on it).
  rect(ctx, 214, 139, 40, 9, '#3a86d8');
  rect(ctx, 214, 139, 40, 1, '#6aa8ec');
  // The rider screen between the seats, and the W under it.
  roundRect(ctx, 122, 124, 76, 44, 3, BEZEL);
  rect(ctx, 144, 168, 32, 12, '#0e0f12');
  const W = ['X...X...X', 'X...X...X', '.X.X.X.X.', '.X.X.X.X.', '..X...X..'];
  W.forEach((row, j) => [...row].forEach((c, i) => c === 'X' && rect(ctx, 156 + i, 170 + j, 1, 1, '#e8e8ea')));
}

// The steering wheel from the back seat: a dark rim lit along its top, three spokes, the badge.
export function drawRideWheel(ctx) {
  const c = 17.5;
  for (let y = 0; y < 36; y++) {
    for (let x = 0; x < 36; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 16.5 && d >= 13.5) rect(ctx, x, y, 1, 1, y < 11 ? '#34363c' : '#1a1b1f');
    }
  }
  rect(ctx, 4, 17, 11, 3, '#3a3c42');
  rect(ctx, 21, 17, 11, 3, '#3a3c42');
  rect(ctx, 16, 21, 4, 11, '#3a3c42');
  fillEllipse(ctx, c, c + 1, 5, 4, '#202226');
  rect(ctx, 17, 18, 2, 2, SILVER);
}

export const RIDE_ART = {
  ride_cabin: { w: 320, h: 180, draw: drawRideCabin },
  ride_seats: { w: 320, h: 180, draw: drawRideSeats },
  ride_wheel: { w: 36, h: 36, draw: drawRideWheel },
};

export function buildRideTextures(scene) {
  for (const [key, { w, h, draw }] of Object.entries(RIDE_ART)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    tex.refresh();
  }
}
