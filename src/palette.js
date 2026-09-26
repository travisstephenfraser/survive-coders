// Terminal palette: Claude orange on black, white text, GitHub green accent.
export const PIX = {
  H: '#d97757', // Claude orange
  h: '#a8553a', // dark orange
  W: '#f5f5f5', // white
  G: '#8b8b8b', // gray
  g: '#2d2d2d', // dark gray
  K: '#0d0d0d', // terminal black
  S: '#f2c29b', // skin
  D: '#5a3a2a', // hair
  N: '#3b4a6b', // pants
  E: '#3fb950', // GitHub green
  e: '#238636', // dark green
  Y: '#e3b341', // star yellow
  R: '#e5534b', // red
  P: '#bc8cff', // purple
  p: '#7a4fbf', // dark purple
  B: '#58a6ff', // blue
};

export const hex = (s) => parseInt(s.slice(1), 16);

export const C = {
  bg: '#0d0d0d',
  orange: PIX.H,
  orangeDark: PIX.h,
  white: PIX.W,
  gray: PIX.G,
  green: PIX.E,
  yellow: PIX.Y,
  red: PIX.R,
  purple: PIX.P,
};

export const FONT = 'Menlo, Monaco, "Courier New", monospace';
