import { PIX } from './palette.js';

// Every texture the game uses is built here from pixel rows ('.' = transparent, letters = PIX
// colors) or a draw function. Asset-pack art overrides a code sprite by loading under
// `pack_<name>`; texKey() prefers the pack version when it exists.

const player = {
  head: [
    '................',
    '.....DDDDD......',
    '....DDDDDDD.....',
    '....DSSSSSD.....',
    '...GDSKSSKSG....',
    '...GSSSSSSSG....',
    '....SSSSSS......',
    '....HHHHHH......',
    '...HHHHHHHH.....',
    '..SHHHWHHHHS....',
    '..SHHHWHHHHS....',
    '...HHHHHHHH.....',
  ],
  idle: ['....NNNNNN......', '....NN..NN......', '....NN..NN......', '...hhh..hhh.....'],
  run0: ['....NNNNNN......', '...NN....NN.....', '..NN......NN....', '.hhh......hhh...'],
  run1: ['....NNNNNN......', '.....NNNN.......', '.....NN.NN......', '....hhh.hhh.....'],
  jump: ['....NNNNNN......', '...NN...NN......', '...hh....NN.....', '.........hhh....'],
};

const DEFS = {
  player_idle: { rows: [...player.head, ...player.idle], swap: { H: 'O' } },
  player_run0: { rows: [...player.head, ...player.run0], swap: { H: 'O' } },
  player_run1: { rows: [...player.head, ...player.run1], swap: { H: 'O' } },
  player_jump: { rows: [...player.head, ...player.jump], swap: { H: 'O' } },

  laptop: {
    rows: [
      '................',
      '................',
      '...GGGGGGGGGG...',
      '...GKKKKKKKKG...',
      '...GKHKKKKKKG...',
      '...GKKHKKKKKG...',
      '...GKHKWWWKKG...',
      '...GKKKKKKKKG...',
      '...GGGGGGGGGG...',
      '..WWWWWWWWWWWW..',
      '...GGGGGGGGGG...',
    ],
    h: 16,
  },

  bolt: {
    w: 8,
    h: 6,
    rows: ['WH......', 'HWH.....', '.HWH....', 'HWH.....', 'WH.WWWW.', '...HHHH.'],
  },

  star: {
    w: 8,
    h: 8,
    rows: ['...Y....', '...Y....', 'YYYYYYY.', '.YYYYY..', '..YYY...', '.YY.YY..', '.Y...Y..', '........'],
  },

  heart: {
    w: 8,
    h: 8,
    rows: ['.RR.RR..', 'RRRRRRR.', 'RRRRRRR.', '.RRRRR..', '..RRR...', '...R....', '........', '........'],
  },

  blob0: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '......PPPP......',
      '....PPPPPPPP....',
      '...PPWPPPWPPP...',
      '..PPWWPPPPPWPP..',
      '..PKPPPPPKPPPP..',
      '.PPPPWPWPPPWPPP.',
      '.PPWPPPPPWPPPPP.',
      '.PPPPPWPPPPWPPP.',
      '.ppppppppppppppp',
    ],
  },
  blob1: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....PPPPPP.....',
      '...PPPWPPPWPP...',
      '..PPWWPPPPPPWPP.',
      '.PPKPPPPPPKPPPP.',
      'PPPPPWPWPPPPWPPP',
      'PPPWPPPPPPWPPPPP',
      'PPPPPPWPPPPPWPPP',
      'pppppppppppppppp',
    ],
  },
  blob_small: {
    w: 8,
    h: 8,
    rows: ['........', '........', '..PPPP..', '.PWPPWP.', 'PKPPPKPP', 'PPWPWPPP', 'pppppppp', '........'],
  },

  goblin0: {
    rows: [
      '................',
      '...e.......e....',
      '...eEEEEEEEe....',
      '....EEEEEEE.....',
      '....EYEEEYE.....',
      '....EEEEEEE.....',
      '....WGWGWGW.....',
      '....EEEEEEE.....',
      '.....EEEEE......',
      '....gggggggg....',
      '...EggggggggE...',
      '...EggggggggE...',
      '....gggggggg....',
      '....ee....ee....',
      '....ee....ee....',
      '...eee...eee....',
    ],
  },
  goblin1: {
    rows: [
      '................',
      '...e.......e....',
      '...eEEEEEEEe....',
      '....EEEEEEE.....',
      '....EYEEEYE.....',
      '....EEEEEEE.....',
      '....WGWGWGW.....',
      '....EEEEEEE.....',
      '.....EEEEE......',
      '....gggggggg....',
      '...EggggggggE...',
      '...EggggggggE...',
      '....gggggggg....',
      '.....ee..ee.....',
      '....ee....ee....',
      '...eee....eee...',
    ],
  },

  keycap: {
    w: 8,
    h: 8,
    rows: ['.GGGGGG.', 'GWWWWWWG', 'GWWKWWWG', 'GWKWKWWG', 'GWWWWWWG', 'GGGGGGGG', '.gggggg.', '........'],
  },

  imgtile: {
    w: 8,
    h: 8,
    rows: ['BBBBBBBB', 'BWWWWWWB', 'BWWWWYWB', 'BWWWWWWB', 'BWEWWWWB', 'BEEEWEWB', 'BEEEEEEB', 'BBBBBBBB'],
  },

  orb: {
    w: 8,
    h: 8,
    rows: ['..PPPP..', '.PPWWPP.', 'PPWPPWPP', 'PPPPWPPP', 'PPPWPPPP', 'PPPPPPPP', '.PPWPPP.', '..PPPP..'],
  },

  // Hydra role icons (8x8): image flood, gaslight (reversed arrows), notification bell.
  icon_flood: {
    w: 8,
    h: 8,
    rows: ['BBBBBBBB', 'BWWWWWWB', 'BWWWWYWB', 'BWWWWWWB', 'BWEWWWWB', 'BEEEWEWB', 'BEEEEEEB', 'BBBBBBBB'],
  },
  icon_gaslight: {
    w: 8,
    h: 8,
    rows: ['..P.....', '.PPPPPP.', '..P.....', '........', '.....P..', '.PPPPPP.', '.....P..', '........'],
  },
  icon_spawn: {
    w: 8,
    h: 8,
    rows: ['...HH...', '..HHHH..', '.HHHHHH.', '.HHHHHH.', '.HHHHHH.', 'HHHHHHHH', '...WW...', '........'],
  },
  heat: {
    w: 6,
    h: 6,
    rows: ['.RRRR.', 'RHYYHR', 'RYWWYR', 'RYWWYR', 'RHYYHR', '.RRRR.'],
  },

  // MAX power-up chip.
  max_chip: {
    w: 22,
    h: 9,
    rows: [
      '.hhhhhhhhhhhhhhhhhhhh.',
      'hOOOOOOOOOOOOOOOOOOOOh',
      'hHHWHHHWHHWWHHWHHHWHHh',
      'hHHWWHWWHWHHWHHWHWHHHh',
      'hHHWHWHWHWWWWHHHWHHHHh',
      'hHHWHHHWHWHHWHHWHWHHHh',
      'hHHWHHHWHWHHWHWHHHWHHh',
      'hHHHHHHHHHHHHHHHHHHHHh',
      '.hhhhhhhhhhhhhhhhhhhh.',
    ],
  },

  px_orange: { w: 2, h: 2, rows: ['HH', 'HH'] },
  px_white: { w: 2, h: 2, rows: ['WW', 'WW'] },
  px_cyan: { w: 2, h: 1, rows: ['CC'], swap: { C: 'B' } },
  px_green: { w: 2, h: 2, rows: ['EE', 'EE'] },
  px_purple: { w: 2, h: 2, rows: ['PP', 'PP'] },
};

// Hydra heads: a chat bubble with role-colored eyes.
const HEAD_ROWS = [
  '................',
  '..WWWWWWWWWWWW..',
  '.WWWWWWWWWWWWWW.',
  '.WWXXWWWWWWXXWW.',
  '.WWXKWWWWWWXKWW.',
  '.WWWWWWWWWWWWWW.',
  '.WWKKKKKKKKKKWW.',
  '.WWKWKWKWKWKKWW.',
  '.WWKKKKKKKKKKWW.',
  '.WWWWWWWWWWWWWW.',
  '..WWWWWWWWWWWW..',
  '....WWW.........',
  '....WW..........',
  '....W...........',
];
DEFS.head_flood = { rows: HEAD_ROWS, swap: { X: 'B' } };
DEFS.head_gaslight = { rows: HEAD_ROWS, swap: { X: 'P' } };
DEFS.head_spawn = { rows: HEAD_ROWS, swap: { X: 'H' } };

// Tileset strip: neon street tiles for SF, warm wood for the Anthropic HQ interior.
export const T = {
  TOP: 0, FILL: 1, PLAT_L: 2, PLAT_M: 3, PLAT_R: 4,
  HQ_TOP: 5, HQ_FILL: 6, HQ_WALL_L: 7, HQ_WALL_R: 8, HQ_PL: 9, HQ_PM: 10, HQ_PR: 11, HQ_BLOCK: 12,
};
const TILE_COUNT = 13;

function codeLines(ctx, ox, seed, colors) {
  // Deterministic "lines of code" dashes so fill tiles read as terminal text.
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let y = 2; y < 16; y += 3) {
    let x = 1 + Math.floor(rnd() * 3);
    while (x < 15) {
      const len = 1 + Math.floor(rnd() * 4);
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(ox + x, y, Math.min(len, 15 - x), 1);
      x += len + 1 + Math.floor(rnd() * 2);
    }
  }
}

// Neon street surface: hot top edge, glow falloff, circuit traces below.
function neonTop(ctx, ox, hot, mid, glow, seed) {
  ctx.fillStyle = '#121114';
  ctx.fillRect(ox, 0, 16, 16);
  codeLines(ctx, ox, seed, ['#2a1a14', '#1c2528', '#221c20']);
  for (const [c, y] of [[hot, 0], [mid, 1], [mid, 2], [glow, 3]]) {
    ctx.fillStyle = c;
    ctx.fillRect(ox, y, 16, 1);
  }
  ctx.fillStyle = '#1f6a70';
  ctx.fillRect(ox + 3, 7, 1, 1);
  ctx.fillRect(ox + 12, 11, 1, 1);
}

function fillTile(ctx, ox, seed) {
  ctx.fillStyle = '#0f0e11';
  ctx.fillRect(ox, 0, 16, 16);
  codeLines(ctx, ox, seed, ['#1f1612', '#161d20']);
}

// Floating neon slab: visible rows 0-11, ends capped on the outside edge.
function slab(ctx, ox, hot, mid, glow, cap) {
  ctx.fillStyle = '#1a1719';
  ctx.fillRect(ox, 0, 16, 12);
  codeLines(ctx, ox, 13 + ox, ['#3a2a22', '#23303a']);
  ctx.clearRect(ox, 12, 16, 4);
  for (const [c, y] of [[hot, 0], [mid, 1], [mid, 2]]) {
    ctx.fillStyle = c;
    ctx.fillRect(ox, y, 16, 1);
  }
  ctx.fillStyle = glow;
  ctx.fillRect(ox, 11, 16, 1);
  ctx.fillStyle = mid;
  if (cap === 'L' || cap === 'B') ctx.fillRect(ox, 0, 1, 12);
  if (cap === 'R' || cap === 'B') ctx.fillRect(ox + 15, 0, 1, 12);
}

const OAK = { hi: '#e0aa70', top: '#c68e55', mid: '#a8703e', low: '#7a4e2a', seam: '#4e3120', deep: '#2e1e14' };

function woodFloor(ctx, ox) {
  const px = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, y, w, h);
  };
  px(0, 0, 16, 16, OAK.mid);
  px(0, 0, 16, 1, OAK.hi);
  px(0, 1, 16, 2, OAK.top);
  px(0, 3, 16, 1, OAK.seam);
  // Plank rows with offset seams and grain.
  for (const [y, seam] of [[4, 5], [8, 12], [12, 2]]) {
    px(0, y + 3, 16, 1, OAK.seam);
    px(seam, y, 1, 3, OAK.seam);
    px((seam + 7) % 16, y + 1, 3, 1, OAK.low);
  }
}

function woodFill(ctx, ox) {
  ctx.fillStyle = OAK.deep;
  ctx.fillRect(ox, 0, 16, 16);
  ctx.fillStyle = '#3a2618';
  for (const [x, y, w] of [[1, 3, 5], [8, 6, 6], [3, 10, 4], [10, 13, 5]]) ctx.fillRect(ox + x, y, w, 1);
}

function woodSlats(ctx, ox) {
  for (let x = 0; x < 16; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? '#6b4426' : '#8a5a32';
    ctx.fillRect(ox + x, 0, 3, 16);
    ctx.fillStyle = OAK.deep;
    ctx.fillRect(ox + x + 3, 0, 1, 16);
  }
}

// Wooden shelf platform: visible rows 0-9, ends capped with end grain.
function shelf(ctx, ox, cap) {
  const px = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, y, w, h);
  };
  px(0, 0, 16, 1, OAK.hi);
  px(0, 1, 16, 2, OAK.top);
  px(0, 3, 16, 5, OAK.mid);
  px(0, 8, 16, 1, OAK.low);
  px(0, 9, 16, 1, '#d97757'); // warm under-shelf light strip
  px(4, 5, 5, 1, OAK.low);
  px(11, 4, 3, 1, OAK.low);
  if (cap === 'L' || cap === 'B') px(0, 0, 2, 9, OAK.seam);
  if (cap === 'R' || cap === 'B') px(14, 0, 2, 9, OAK.seam);
}

// Robotaxi (white SUV, roof sensor dome), side view facing right, 56x30. Built from per-row
// spans so every edge stays pixel-crisp.
function waymo(ctx, open) {
  const span = (y, x0, x1, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x0, y, x1 - x0 + 1, 1);
  };
  const WHITE = '#eef0f2';
  const SHADE = '#c9ccd1';
  const SEAM = '#a9aeb5';
  const GLASS = '#1a1f26';
  // Sensor dome on the roof.
  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(25, 0, 7, 1);
  ctx.fillStyle = '#2b2f36';
  ctx.fillRect(24, 1, 9, 5);
  span(3, 24, 32, '#39c5cf');
  // Roof and windows.
  span(6, 18, 38, WHITE);
  span(7, 16, 41, WHITE);
  [[8, 18, 40], [9, 17, 41], [10, 16, 42], [11, 15, 43], [12, 14, 44]].forEach(([y, a, b]) => span(y, a, b, GLASS));
  span(9, 19, 26, '#2f6f78');
  for (let y = 8; y <= 12; y++) span(y, 29, 29, WHITE); // B-pillar
  span(8, 41, 42, '#2b2f36'); // front roof sensor
  // Body.
  [[13, 14, 45], [14, 8, 49], [15, 5, 52], [16, 3, 53], [17, 2, 54]].forEach(([y, a, b]) => span(y, a, b, WHITE));
  for (let y = 18; y <= 24; y++) span(y, 2, 55, y >= 21 ? SHADE : WHITE);
  for (let y = 14; y <= 22; y++) {
    span(y, 18, 18, SEAM);
    span(y, 29, 29, SEAM);
  }
  span(17, 51, 54, '#fff2c4'); // headlight
  span(18, 51, 53, '#fff2c4');
  span(18, 2, 4, '#e5534b'); // taillight
  span(20, 55, 55, '#2b2f36'); // bumper sensor
  span(15, 47, 48, '#2b2f36'); // fender camera
  if (open) {
    // Rear door open: warm interior light.
    for (let y = 14; y <= 22; y++) span(y, 19, 28, y > 19 ? '#6b4a2a' : '#1c1410');
    span(15, 21, 26, '#f0c090');
  }
  // Wheels with arches.
  for (const cx of [13, 45]) {
    for (let y = 20; y <= 29; y++) {
      const dy = y - 25;
      const half = Math.floor(Math.sqrt(Math.max(0, 20 - dy * dy)));
      if (y <= 21) span(y, cx - 5, cx + 5, '#2a2d33');
      else span(y, cx - half, cx + half, '#111317');
    }
    ctx.fillStyle = '#8b8f96';
    ctx.fillRect(cx - 1, 24, 3, 3);
  }
}

// Spinning roof lidar: a 2-texel light (px_cyan) sweeping across the dome's cyan band
// (texture x 24-32, row 3), centred on the dome and never past its edges. Derived from the
// car's scale and origin, so the intro (1x, centred) and the ending (2x, bottom origin) agree.
export function placeLidar(light, car, time) {
  const left = car.x - car.displayOriginX * car.scaleX;
  const top = car.y - car.displayOriginY * car.scaleY;
  light.setScale(car.scaleX, car.scaleY);
  light.setPosition(left + (28.5 + Math.sin(time / 70) * 3.5) * car.scaleX, top + 3.5 * car.scaleY);
}

// H100: a big data-center GPU card, side view, walking on its gold PCIe fingers. 40x18.
function h100(ctx, frame) {
  const r = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  r(0, 1, 2, 16, '#c9ccd1'); // IO bracket
  r(2, 2, 36, 13, '#23262c'); // shroud
  r(2, 2, 36, 1, '#d7dbe0'); // silver top trim
  r(2, 3, 36, 1, '#3fb950'); // compute-green light strip
  r(2, 14, 36, 1, '#8b8f96');
  // Fan: ring, dark well, spinning blades, hub.
  const cx = 10;
  const cy = 8;
  for (let y = -6; y <= 6; y++) {
    for (let x = -6; x <= 6; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= 5.9 && d > 4.9) r(cx + x, cy + y, 1, 1, '#8b8f96');
      else if (d <= 4.9) r(cx + x, cy + y, 1, 1, '#111317');
    }
  }
  const blades = frame ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of blades) for (let i = 1; i <= 4; i++) r(cx + dx * i, cy + dy * i, 1, 1, '#5a5f66');
  r(cx - 1, cy - 1, 2, 2, '#d7dbe0');
  // Label plate with "H100" in a 3x5 pixel font.
  r(19, 5, 18, 8, '#0d0d0d');
  ctx.strokeStyle = '#3fb950';
  ctx.lineWidth = 1;
  ctx.strokeRect(19.5, 5.5, 17, 7);
  const GLYPHS = {
    H: ['#.#', '#.#', '###', '#.#', '#.#'],
    1: ['.#.', '##.', '.#.', '.#.', '###'],
    0: ['###', '#.#', '#.#', '#.#', '###'],
  };
  [...'H100'].forEach((ch, i) =>
    GLYPHS[ch].forEach((row, y) => [...row].forEach((c, x) => c === '#' && r(21 + i * 4 + x, 7 + y, 1, 1, '#f5f5f5'))),
  );
  r(35, 13, 1, 1, frame ? '#e5534b' : '#ff8f80'); // status LED
  for (let x = 8; x <= 32; x += 2) r(x, 15, 1, 3, '#e3b341'); // PCIe gold fingers (the feet)
}

const DRAWN = {
  gpu0: { w: 40, h: 18, draw: (ctx) => h100(ctx, 0) },
  gpu1: { w: 40, h: 18, draw: (ctx) => h100(ctx, 1) },
  waymo: { w: 56, h: 30, draw: (ctx) => waymo(ctx, false) },
  waymo_open: { w: 56, h: 30, draw: (ctx) => waymo(ctx, true) },
  tiles: {
    w: 16 * TILE_COUNT,
    h: 16,
    draw(ctx) {
      const at = (i) => i * 16;
      neonTop(ctx, at(T.TOP), '#f3a07a', PIX.H, '#6b3b2b', 7);
      fillTile(ctx, at(T.FILL), 3);
      slab(ctx, at(T.PLAT_L), '#f3a07a', PIX.H, '#6b3b2b', 'L');
      slab(ctx, at(T.PLAT_M), '#f3a07a', PIX.H, '#6b3b2b', '');
      slab(ctx, at(T.PLAT_R), '#f3a07a', PIX.H, '#6b3b2b', 'R');
      // Anthropic HQ interior: oak floor, wood-slat walls, wooden shelf platforms.
      woodFloor(ctx, at(T.HQ_TOP));
      woodFill(ctx, at(T.HQ_FILL));
      woodSlats(ctx, at(T.HQ_WALL_L));
      woodSlats(ctx, at(T.HQ_WALL_R));
      shelf(ctx, at(T.HQ_PL), 'L');
      shelf(ctx, at(T.HQ_PM), '');
      shelf(ctx, at(T.HQ_PR), 'R');
      shelf(ctx, at(T.HQ_BLOCK), 'B');
    },
  },

  house: {
    w: 48,
    h: 44,
    draw(ctx) {
      ctx.fillStyle = '#191919';
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.lineTo(24, 0);
      ctx.lineTo(48, 18);
      ctx.fill();
      ctx.fillRect(4, 18, 40, 26);
      ctx.fillStyle = '#6b3b2b';
      ctx.fillRect(10, 24, 8, 6);
      ctx.fillRect(30, 24, 8, 6);
      ctx.fillStyle = '#262626';
      ctx.fillRect(21, 32, 6, 12);
    },
  },

  blast: {
    w: 32,
    h: 16,
    draw(ctx) {
      for (const o of [0, 10, 20]) {
        for (let y = 0; y < 16; y++) {
          const d = Math.abs(y - 7.5);
          for (let x = 0; x < 12; x++) {
            const dx = x - (7.5 - d);
            if (dx >= 0 && dx < 4) {
              ctx.fillStyle = dx < 1.5 ? PIX.W : PIX.H;
              ctx.fillRect(o + x, y, 1, 1);
            }
          }
        }
      }
    },
  },

  hydra_body: {
    w: 56,
    h: 40,
    draw(ctx) {
      ctx.fillStyle = PIX.h;
      ctx.fillRect(4, 6, 48, 34);
      ctx.fillRect(0, 12, 56, 28);
      ctx.fillRect(10, 0, 36, 8);
      ctx.fillStyle = PIX.H;
      for (const [x, y, w, h] of [[8, 10, 6, 4], [22, 6, 8, 3], [38, 12, 7, 4], [14, 22, 5, 3], [32, 24, 9, 3], [6, 30, 4, 3], [44, 30, 6, 3]]) {
        ctx.fillRect(x, y, w, h);
      }
      ctx.fillStyle = '#5a2e20';
      ctx.fillRect(4, 36, 10, 4);
      ctx.fillRect(42, 36, 10, 4);
    },
  },
};

// 1px dark outline around opaque pixels (4-neighborhood): the classic sprite-readability trick
// against busy backgrounds; the Ninja pack sprites already have one.
const OUTLINE = '#140c12';
function outline(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  ctx.fillStyle = OUTLINE;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a(x, y)) continue;
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function paintRows(ctx, rows, w, swap) {
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      let ch = row[x] ?? '.';
      if (swap?.[ch]) ch = swap[ch];
      if (ch === '.' || !PIX[ch]) continue;
      ctx.fillStyle = PIX[ch];
      ctx.fillRect(x, y, 1, 1);
    }
  });
}

const OUTLINED = /^(player_|laptop|goblin|keycap|blob|head_)/;

// Paints a row-defined sprite (colour swaps, outline) onto any 2D context. Shared with
// scripts/make-images.mjs, which draws the favicon and link-preview art from the same pixels.
export function spriteSize(key) {
  return { w: DEFS[key].w ?? 16, h: DEFS[key].h ?? 16 };
}

export function paintSprite(ctx, key) {
  const def = DEFS[key];
  const { w, h } = spriteSize(key);
  paintRows(ctx, def.rows, w, def.swap);
  if (OUTLINED.test(key)) outline(ctx, w, h);
}

export function buildTextures(scene) {
  for (const key of Object.keys(DEFS)) {
    if (scene.textures.exists(key)) continue;
    const { w, h } = spriteSize(key);
    const tex = scene.textures.createCanvas(key, w, h);
    paintSprite(tex.getContext(), key);
    tex.refresh();
  }
  for (const [key, def] of Object.entries(DRAWN)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, def.w, def.h);
    const ctx = tex.getContext();
    def.draw(ctx);
    tex.refresh();
  }

  const anims = scene.anims;
  const mk = (key, frames, rate) => {
    if (!anims.exists(key)) anims.create({ key, frames: frames.map((k) => ({ key: k })), frameRate: rate, repeat: -1 });
  };
  mk('run', ['player_run0', 'player_idle', 'player_run1', 'player_idle'], 10);
  mk('blob', ['blob0', 'blob1'], 3);
  mk('goblin', ['goblin0', 'goblin1'], 6);
  mk('gpu_fans', ['gpu0', 'gpu1'], 12);
  // Ninja Adventure sheets: 4 columns = facing down/up/left/right, rows = animation frames.
  const sheet = (key, tex, frames, rate) => {
    if (scene.textures.exists(tex) && !anims.exists(key)) {
      anims.create({ key, frames: anims.generateFrameNumbers(tex, { frames }), frameRate: rate, repeat: -1 });
    }
  };
  sheet('slime_hop', 'pack_slime', [3, 7, 11, 15], 6);
  sheet('skull_walk', 'pack_skull', [3, 7, 11, 15], 6);
}

// Prefer asset-pack art (loaded as `pack_<name>`) over the code-drawn fallback.
export function texKey(scene, name) {
  return scene.textures.exists(`pack_${name}`) ? `pack_${name}` : name;
}
