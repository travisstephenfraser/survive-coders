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
  O: '#f59a70', // player hoodie: a brighter Claude orange so the hero pops off orange-lit streets
  // Salesforce Park crowd.
  Q: '#cfc6b4', // founder's oatmeal quarter-zip
  q: '#9d9482', // quarter-zip shade
  k: '#a8905e', // khaki chinos
  V: '#2f4368', // fleece vest navy
  v: '#1f2c47', // vest shade
  L: '#a8c8e8', // oxford-blue shirt
  Z: '#d9b25c', // blond swoop
  c: '#6b4226', // coffee
  // Salesforce Tower.
  U: '#56637a', // sales suit
  u: '#3b455a', // suit shade
  X: '#8fd0ff', // chatbot screen glow
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
