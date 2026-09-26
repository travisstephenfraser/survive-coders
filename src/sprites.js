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
  player_idle: { rows: [...player.head, ...player.idle] },
  player_run0: { rows: [...player.head, ...player.run0] },
  player_run1: { rows: [...player.head, ...player.run1] },
  player_jump: { rows: [...player.head, ...player.jump] },

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
    rows: ['HH......', '.HH.....', '..HH....', '.HH.....', 'HH.WWWW.', '........'],
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

  skullops: {
    rows: [
      '................',
      '....WWWWWWWW....',
      '...WWWWWWWWWW...',
      '..WWWWWWWWWWWW..',
      '..WWWWKKKKWWWW..',
      '..WWWKKHHKKWWW..',
      '..WWWKKHHKKWWW..',
      '..WWWWKKKKWWWW..',
      '..WWWWWWWWWWWW..',
      '...WWWWKKWWWW...',
      '....WWWWWWWW....',
      '....WKWKWKWW....',
      '....WWWWWWWW....',
      '.....G....G.....',
      '....GG....GG....',
      '................',
    ],
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

  px_orange: { w: 2, h: 2, rows: ['HH', 'HH'] },
  px_white: { w: 2, h: 2, rows: ['WW', 'WW'] },
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

// Tileset strip. Street tiles are code-drawn neon; HQ tiles are copied from the Sci-Fi Starter
// pack (frame numbers in SCIFI) when it loads, else drawn as a cyan variant of the street.
export const T = {
  TOP: 0, FILL: 1, PLAT_L: 2, PLAT_M: 3, PLAT_R: 4,
  HQ_TOP: 5, HQ_FILL: 6, HQ_WALL_L: 7, HQ_WALL_R: 8, HQ_PL: 9, HQ_PM: 10, HQ_PR: 11, HQ_BLOCK: 12,
};
const TILE_COUNT = 13;
const SCIFI = {
  [T.HQ_TOP]: 1, [T.HQ_FILL]: 7, [T.HQ_WALL_L]: 8, [T.HQ_WALL_R]: 6,
  [T.HQ_PL]: 24, [T.HQ_PM]: 25, [T.HQ_PR]: 26, [T.HQ_BLOCK]: 15,
};

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

const DRAWN = {
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
      // HQ fallbacks (cyan) in case the Sci-Fi pack is missing.
      neonTop(ctx, at(T.HQ_TOP), '#9ff3f7', '#39c5cf', '#1f6a70', 11);
      fillTile(ctx, at(T.HQ_FILL), 5);
      fillTile(ctx, at(T.HQ_WALL_L), 9);
      fillTile(ctx, at(T.HQ_WALL_R), 15);
      slab(ctx, at(T.HQ_PL), '#9ff3f7', '#39c5cf', '#1f6a70', 'L');
      slab(ctx, at(T.HQ_PM), '#9ff3f7', '#39c5cf', '#1f6a70', '');
      slab(ctx, at(T.HQ_PR), '#9ff3f7', '#39c5cf', '#1f6a70', 'R');
      slab(ctx, at(T.HQ_BLOCK), '#9ff3f7', '#39c5cf', '#1f6a70', 'B');
    },
  },

  door: {
    w: 16,
    h: 32,
    draw(ctx) {
      ctx.fillStyle = PIX.E;
      ctx.fillRect(0, 0, 16, 32);
      ctx.fillStyle = PIX.e;
      ctx.fillRect(2, 2, 12, 30);
      // merge icon
      ctx.fillStyle = PIX.W;
      ctx.fillRect(5, 8, 2, 12);
      ctx.fillRect(4, 6, 4, 3);
      ctx.fillRect(4, 19, 4, 3);
      ctx.fillRect(10, 17, 2, 3);
      ctx.fillRect(9, 20, 4, 3);
      ctx.fillRect(7, 11, 2, 2);
      ctx.fillRect(9, 13, 2, 4);
      ctx.fillStyle = PIX.Y;
      ctx.fillRect(11, 24, 2, 2);
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

export function buildTextures(scene) {
  for (const [key, def] of Object.entries(DEFS)) {
    if (scene.textures.exists(key)) continue;
    const w = def.w ?? 16;
    const h = def.h ?? 16;
    const tex = scene.textures.createCanvas(key, w, h);
    paintRows(tex.getContext(), def.rows, w, def.swap);
    tex.refresh();
  }
  for (const [key, def] of Object.entries(DRAWN)) {
    if (scene.textures.exists(key)) continue;
    const tex = scene.textures.createCanvas(key, def.w, def.h);
    const ctx = tex.getContext();
    def.draw(ctx);
    if (key === 'tiles' && scene.textures.exists('pack_scifi_tiles')) {
      const src = scene.textures.get('pack_scifi_tiles').getSourceImage();
      const cols = Math.floor(src.width / 16);
      for (const [slot, frame] of Object.entries(SCIFI)) {
        ctx.clearRect(slot * 16, 0, 16, 16);
        ctx.drawImage(src, (frame % cols) * 16, Math.floor(frame / cols) * 16, 16, 16, slot * 16, 0, 16, 16);
      }
    }
    tex.refresh();
  }

  const anims = scene.anims;
  const mk = (key, frames, rate) => {
    if (!anims.exists(key)) anims.create({ key, frames: frames.map((k) => ({ key: k })), frameRate: rate, repeat: -1 });
  };
  mk('run', ['player_run0', 'player_idle', 'player_run1', 'player_idle'], 10);
  mk('blob', ['blob0', 'blob1'], 3);
  mk('goblin', ['goblin0', 'goblin1'], 6);
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
