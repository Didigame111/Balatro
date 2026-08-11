// Card art, drawn as inline SVG rather than shipped as images or borrowed
// from the emoji font.
//
// Most Jokers are a jester built from parameters — hat shape, palette, face —
// which gives every one of them a distinct look from a small amount of code.
// Jokers that are clearly an object instead of a character get a motif.

const VIEW = '0 0 100 140';
let uid = 0;

function gid() { return `a${(uid += 1).toString(36)}`; }

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hsl(h, s, l) { return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`; }

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const PALETTES = {
  red:    { bg: ['#8f2f34', '#5c1a20'], hat: ['#e0474c', '#a52a30'], trim: '#f5d76e', skin: '#f7e0c8' },
  blue:   { bg: ['#26568f', '#16304f'], hat: ['#3d8fd9', '#22568f'], trim: '#cfe9ff', skin: '#f7e0c8' },
  green:  { bg: ['#2c6b4a', '#173d2a'], hat: ['#3fa86a', '#25714a'], trim: '#e8f5c8', skin: '#f7e0c8' },
  purple: { bg: ['#553a86', '#2e1f4d'], hat: ['#8f6fd4', '#5c47a0'], trim: '#e6d8ff', skin: '#f7e0c8' },
  gold:   { bg: ['#8a6a1e', '#4f3b0e'], hat: ['#eac058', '#b48c2a'], trim: '#fff3c4', skin: '#f7e0c8' },
  teal:   { bg: ['#1f6b6b', '#0f3c3c'], hat: ['#37a8a0', '#1f7570'], trim: '#d6f7f2', skin: '#f7e0c8' },
  pink:   { bg: ['#8f2f66', '#571c3e'], hat: ['#e0609f', '#a83c70'], trim: '#ffd9ec', skin: '#f7e0c8' },
  slate:  { bg: ['#3b4750', '#212a31'], hat: ['#66798a', '#3f4d59'], trim: '#dbe6ee', skin: '#f7e0c8' },
  orange: { bg: ['#94511c', '#552c0d'], hat: ['#e08a34', '#a85e1c'], trim: '#ffe0b8', skin: '#f7e0c8' },
  bone:   { bg: ['#6d6455', '#3c3830'], hat: ['#d8cdb4', '#a89c80'], trim: '#fffaf0', skin: '#efe3cf' },
};

const PALETTE_KEYS = Object.keys(PALETTES);

function paletteFor(key, name) {
  if (name && PALETTES[name]) return PALETTES[name];
  return PALETTES[PALETTE_KEYS[hash(key) % PALETTE_KEYS.length]];
}

// ---------------------------------------------------------------------------
// Jester character
// ---------------------------------------------------------------------------

const HATS = {
  // Classic three-point cap with bells.
  three: (p) => `
    <path d="M22 62 Q20 30 34 22 Q50 12 66 22 Q80 30 78 62 Z" fill="${p.hat[0]}"/>
    <path d="M50 16 L50 62 Q34 62 22 62 Q20 30 34 22 Q42 17 50 16 Z" fill="${p.hat[1]}"/>
    <path d="M24 40 Q6 32 8 16" stroke="${p.hat[0]}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M76 40 Q94 32 92 16" stroke="${p.hat[1]}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M50 20 L50 6" stroke="${p.hat[0]}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="8" cy="14" r="6" fill="${p.trim}"/>
    <circle cx="92" cy="14" r="6" fill="${p.trim}"/>
    <circle cx="50" cy="5" r="6" fill="${p.trim}"/>`,
  // Two floppy points.
  two: (p) => `
    <path d="M22 62 Q20 32 36 24 Q50 16 64 24 Q80 32 78 62 Z" fill="${p.hat[0]}"/>
    <path d="M50 18 L50 62 Q34 62 22 62 Q20 32 36 24 Q42 20 50 18 Z" fill="${p.hat[1]}"/>
    <path d="M28 34 Q10 18 18 4" stroke="${p.hat[1]}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M72 34 Q90 18 82 4" stroke="${p.hat[0]}" stroke-width="8" fill="none" stroke-linecap="round"/>
    <circle cx="18" cy="4" r="6" fill="${p.trim}"/>
    <circle cx="82" cy="4" r="6" fill="${p.trim}"/>`,
  // Rounded skullcap with a band.
  cap: (p) => `
    <path d="M20 62 Q20 26 50 26 Q80 26 80 62 Z" fill="${p.hat[0]}"/>
    <path d="M50 26 Q20 26 20 62 L50 62 Z" fill="${p.hat[1]}"/>
    <rect x="18" y="56" width="64" height="9" rx="4" fill="${p.trim}"/>
    <circle cx="50" cy="24" r="7" fill="${p.trim}"/>`,
  // Tall pointed wizard hat.
  tall: (p) => `
    <path d="M24 62 Q30 20 50 2 Q70 20 76 62 Z" fill="${p.hat[0]}"/>
    <path d="M50 2 Q30 20 24 62 L50 62 Z" fill="${p.hat[1]}"/>
    <rect x="20" y="54" width="60" height="10" rx="5" fill="${p.trim}"/>
    <circle cx="50" cy="4" r="5" fill="${p.trim}"/>`,
  // Crown, for the royals.
  crown: (p) => `
    <path d="M22 62 L22 30 L36 44 L50 24 L64 44 L78 30 L78 62 Z" fill="${p.hat[0]}"/>
    <rect x="20" y="56" width="60" height="9" rx="4" fill="${p.trim}"/>
    <circle cx="22" cy="28" r="5" fill="${p.trim}"/>
    <circle cx="50" cy="22" r="5" fill="${p.trim}"/>
    <circle cx="78" cy="28" r="5" fill="${p.trim}"/>`,
  // Bare head — hoods, masks and the odd bald joker.
  none: () => '',
};

const FACES = {
  smile: (p) => `
    <circle cx="38" cy="84" r="4.5" fill="#2b2b33"/>
    <circle cx="62" cy="84" r="4.5" fill="#2b2b33"/>
    <path d="M36 96 Q50 108 64 96" stroke="#2b2b33" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  grin: (p) => `
    <circle cx="38" cy="83" r="4.5" fill="#2b2b33"/>
    <circle cx="62" cy="83" r="4.5" fill="#2b2b33"/>
    <path d="M34 94 Q50 112 66 94 Z" fill="#2b2b33"/>
    <path d="M40 96 L60 96" stroke="#fff" stroke-width="3"/>`,
  frown: () => `
    <path d="M32 80 L44 86 M68 80 L56 86" stroke="#2b2b33" stroke-width="4" stroke-linecap="round"/>
    <circle cx="38" cy="88" r="4" fill="#2b2b33"/>
    <circle cx="62" cy="88" r="4" fill="#2b2b33"/>
    <path d="M38 104 Q50 94 62 104" stroke="#2b2b33" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  wink: () => `
    <path d="M32 84 Q38 79 44 84" stroke="#2b2b33" stroke-width="4" fill="none" stroke-linecap="round"/>
    <circle cx="62" cy="84" r="4.5" fill="#2b2b33"/>
    <path d="M36 97 Q50 106 64 97" stroke="#2b2b33" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  blank: () => `
    <circle cx="38" cy="84" r="4.5" fill="#2b2b33"/>
    <circle cx="62" cy="84" r="4.5" fill="#2b2b33"/>
    <path d="M38 100 L62 100" stroke="#2b2b33" stroke-width="4" stroke-linecap="round"/>`,
  wide: () => `
    <circle cx="37" cy="83" r="7" fill="#fff" stroke="#2b2b33" stroke-width="2"/>
    <circle cx="63" cy="83" r="7" fill="#fff" stroke="#2b2b33" stroke-width="2"/>
    <circle cx="37" cy="84" r="3" fill="#2b2b33"/>
    <circle cx="63" cy="84" r="3" fill="#2b2b33"/>
    <ellipse cx="50" cy="102" rx="9" ry="7" fill="#2b2b33"/>`,
  shades: (p) => `
    <rect x="28" y="78" width="44" height="12" rx="4" fill="#2b2b33"/>
    <path d="M36 97 Q50 105 64 97" stroke="#2b2b33" stroke-width="4" fill="none" stroke-linecap="round"/>`,
};

const HAT_KEYS = Object.keys(HATS).filter((k) => k !== 'none' && k !== 'crown');
const FACE_KEYS = Object.keys(FACES);

function jester(key, opts = {}) {
  const p = paletteFor(key, opts.palette);
  const seed = hash(key);
  const hat = HATS[opts.hat || HAT_KEYS[seed % HAT_KEYS.length]] || HATS.three;
  const face = FACES[opts.face || FACE_KEYS[(seed >> 3) % FACE_KEYS.length]] || FACES.smile;
  const g = gid();
  return `
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/>
    </linearGradient></defs>
    <rect width="100" height="140" fill="url(#${g})"/>
    <ellipse cx="50" cy="126" rx="34" ry="16" fill="${p.hat[1]}"/>
    <path d="M18 126 Q50 108 82 126 L82 140 L18 140 Z" fill="${p.hat[0]}"/>
    <ellipse cx="50" cy="112" rx="30" ry="10" fill="${p.trim}"/>
    <ellipse cx="50" cy="88" rx="27" ry="29" fill="${p.skin}"/>
    ${hat(p)}
    ${face(p)}
    ${opts.badge || ''}`;
}

// ---------------------------------------------------------------------------
// Object motifs
// ---------------------------------------------------------------------------

function frame(p, inner) {
  const g = gid();
  return `
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/>
    </linearGradient></defs>
    <rect width="100" height="140" fill="url(#${g})"/>
    ${inner}`;
}

const SUIT_PATH = {
  S: 'M50 34 C36 52 26 60 26 74 a12 12 0 0 0 22 7 L44 100 h12 L52 81 a12 12 0 0 0 22 -7 C74 60 64 52 50 34 Z',
  H: 'M50 104 C22 84 26 56 40 52 c6 -2 10 2 10 8 c0 -6 4 -10 10 -8 c14 4 18 32 -10 52 Z',
  D: 'M50 32 L76 70 L50 108 L24 70 Z',
  C: 'M50 34 a13 13 0 0 1 11 20 a13 13 0 1 1 -8 22 L56 100 h-12 L47 76 a13 13 0 1 1 -8 -22 A13 13 0 0 1 50 34 Z',
};

const MOTIFS = {
  suit: (p, o) => frame(p, `
    <circle cx="50" cy="70" r="34" fill="rgba(255,255,255,.1)"/>
    <path d="${SUIT_PATH[o.suit || 'S']}" fill="${o.suitColor || p.trim}"/>`),

  coin: (p) => frame(p, `
    <circle cx="50" cy="70" r="30" fill="#c99a24"/>
    <circle cx="50" cy="70" r="24" fill="#eac058"/>
    <text x="50" y="84" font-size="34" font-weight="900" text-anchor="middle" fill="#8a6a1e" font-family="sans-serif">$</text>`),

  gem: (p, o) => frame(p, `
    <path d="M30 52 H70 L84 74 L50 110 L16 74 Z" fill="${o.color || '#5ad7f2'}"/>
    <path d="M30 52 L50 110 L16 74 Z" fill="rgba(0,0,0,.22)"/>
    <path d="M30 52 H70 L60 74 H40 Z" fill="rgba(255,255,255,.45)"/>`),

  dice: (p) => frame(p, `
    <rect x="26" y="46" width="48" height="48" rx="9" fill="#f4f4ec"/>
    <circle cx="40" cy="60" r="5" fill="#2b2b33"/><circle cx="60" cy="60" r="5" fill="#2b2b33"/>
    <circle cx="50" cy="70" r="5" fill="#2b2b33"/>
    <circle cx="40" cy="80" r="5" fill="#2b2b33"/><circle cx="60" cy="80" r="5" fill="#2b2b33"/>`),

  skull: (p) => frame(p, `
    <path d="M26 66 a24 24 0 0 1 48 0 v14 a10 10 0 0 1 -8 10 l-2 12 h-28 l-2 -12 a10 10 0 0 1 -8 -10 Z" fill="#efe8d8"/>
    <circle cx="39" cy="70" r="8" fill="#2b2b33"/><circle cx="61" cy="70" r="8" fill="#2b2b33"/>
    <path d="M50 80 l-5 10 h10 Z" fill="#2b2b33"/>
    <rect x="42" y="96" width="4" height="8" fill="#2b2b33"/><rect x="54" y="96" width="4" height="8" fill="#2b2b33"/>`),

  star: (p, o) => frame(p, `
    <circle cx="50" cy="70" r="34" fill="rgba(255,255,255,.08)"/>
    <path d="M50 34 L60 62 L90 62 L66 80 L75 108 L50 90 L25 108 L34 80 L10 62 L40 62 Z" fill="${o.color || p.trim}"/>
    <path d="M20 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z" fill="${p.trim}" opacity=".9"/>
    <path d="M82 104 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 Z" fill="${p.trim}" opacity=".75"/>`),

  bolt: (p) => frame(p, `
    <circle cx="50" cy="70" r="32" fill="rgba(255,255,255,.09)"/>
    <path d="M50 26 L54 46 M50 114 L46 94 M14 70 h20 M86 70 h-20" stroke="${p.trim}" stroke-width="4" stroke-linecap="round" opacity=".55"/>
    <path d="M58 30 L30 78 H48 L42 112 L72 62 H54 Z" fill="#f5d76e" stroke="#a8862a" stroke-width="3" stroke-linejoin="round"/>`),

  moon: (p) => frame(p, `
    <circle cx="56" cy="70" r="30" fill="#f2efdc"/>
    <circle cx="42" cy="64" r="26" fill="${p.bg[1]}"/>
    <circle cx="76" cy="36" r="3" fill="#fff"/><circle cx="20" cy="104" r="3" fill="#fff"/>`),

  planet: (p, o) => frame(p, `
    <circle cx="50" cy="70" r="26" fill="${o.color || '#7fb8e8'}"/>
    <circle cx="40" cy="60" r="7" fill="rgba(0,0,0,.16)"/>
    <circle cx="60" cy="82" r="5" fill="rgba(0,0,0,.16)"/>
    <ellipse cx="50" cy="72" rx="44" ry="10" fill="none" stroke="${o.ring || '#e6d8a0'}" stroke-width="5" transform="rotate(-18 50 72)"/>`),

  flame: (p) => frame(p, `
    <path d="M50 26 C64 48 78 56 78 78 a28 28 0 0 1 -56 0 C22 58 34 52 40 38 c4 10 6 14 10 16 C48 46 46 36 50 26 Z" fill="#f27d2a"/>
    <path d="M50 60 c8 10 12 14 12 24 a12 12 0 0 1 -24 0 c0 -8 6 -14 12 -24 Z" fill="#f5d76e"/>`),

  drop: (p, o) => frame(p, `
    <path d="M50 30 C68 58 76 68 76 82 a26 26 0 0 1 -52 0 C24 68 32 58 50 30 Z" fill="${o.color || '#4fa8e0'}"/>
    <ellipse cx="40" cy="82" rx="6" ry="9" fill="rgba(255,255,255,.5)"/>`),

  eye: (p) => frame(p, `
    <path d="M14 72 Q50 36 86 72 Q50 108 14 72 Z" fill="#f4f4ec"/>
    <circle cx="50" cy="72" r="17" fill="#3d8fd9"/>
    <circle cx="50" cy="72" r="8" fill="#2b2b33"/>
    <circle cx="45" cy="66" r="3.5" fill="#fff"/>`),

  // A raised fist by default; `fingers: 'four'` shows an open four-finger hand.
  hand: (p, o) => frame(p, o.fingers === 'four' ? `
    <g stroke="#b98f6a" stroke-width="2" fill="${p.skin}">
      <rect x="28" y="44" width="11" height="42" rx="5.5"/>
      <rect x="41" y="38" width="11" height="48" rx="5.5"/>
      <rect x="54" y="40" width="11" height="46" rx="5.5"/>
      <rect x="67" y="48" width="11" height="38" rx="5.5"/>
      <path d="M26 78 h54 v18 a14 14 0 0 1 -14 14 H40 a14 14 0 0 1 -14 -14 Z"/>
    </g>
    <rect x="30" y="110" width="46" height="14" rx="5" fill="${p.hat[0]}"/>` : `
    <g stroke="#b98f6a" stroke-width="2" fill="${p.skin}">
      <path d="M28 66 h44 a10 10 0 0 1 10 10 v20 a14 14 0 0 1 -14 14 H32 a14 14 0 0 1 -14 -14 V76 a10 10 0 0 1 10 -10 Z"/>
      <path d="M32 66 v-8 a6 6 0 0 1 12 0 v8 M46 66 v-10 a6 6 0 0 1 12 0 v10 M60 66 v-8 a6 6 0 0 1 12 0 v8"/>
      <path d="M20 84 a9 9 0 0 1 -2 -18 l6 1"/>
    </g>
    <rect x="24" y="108" width="52" height="14" rx="5" fill="${p.hat[0]}"/>`),

  book: (p, o) => frame(p, `
    <rect x="22" y="42" width="56" height="60" rx="4" fill="${o.color || '#8a4a2a'}"/>
    <rect x="28" y="48" width="44" height="48" rx="2" fill="#f4f4ec"/>
    <path d="M50 48 V96" stroke="#c9c2ae" stroke-width="3"/>
    <path d="M34 60 h12 M34 70 h12 M54 60 h12 M54 70 h12" stroke="#9a927e" stroke-width="3"/>`),

  key: (p) => frame(p, `
    <circle cx="42" cy="56" r="16" fill="none" stroke="#eac058" stroke-width="8"/>
    <path d="M50 68 L72 104 M62 88 l12 -6 M70 100 l12 -6" stroke="#eac058" stroke-width="8" stroke-linecap="round"/>`),

  ticket: (p) => frame(p, `
    <path d="M18 52 h64 v14 a8 8 0 0 0 0 16 v14 H18 v-14 a8 8 0 0 0 0 -16 Z" fill="#f2efdc"/>
    <path d="M50 56 v8 m0 8 v8 m0 8 v8" stroke="#9a927e" stroke-width="3" stroke-dasharray="4 5"/>`),

  bone: (p) => frame(p, `
    <g transform="rotate(-30 50 72)">
      <rect x="30" y="64" width="40" height="14" rx="7" fill="#efe8d8"/>
      <circle cx="30" cy="64" r="9" fill="#efe8d8"/><circle cx="30" cy="78" r="9" fill="#efe8d8"/>
      <circle cx="70" cy="64" r="9" fill="#efe8d8"/><circle cx="70" cy="78" r="9" fill="#efe8d8"/>
    </g>`),

  cat: (p, o) => frame(p, `
    <path d="M28 58 L34 36 L48 50 h4 L66 36 L72 58 Z" fill="${o.color || '#e0a94c'}"/>
    <ellipse cx="50" cy="80" rx="28" ry="26" fill="${o.color || '#e0a94c'}"/>
    <circle cx="40" cy="76" r="4" fill="#2b2b33"/><circle cx="60" cy="76" r="4" fill="#2b2b33"/>
    <path d="M50 86 l-4 4 h8 Z" fill="#d4738f"/>
    <path d="M22 82 h14 M22 90 h14 M64 82 h14 M64 90 h14" stroke="#2b2b33" stroke-width="2"/>`),

  fish: (p) => frame(p, `
    <path d="M22 72 C36 50 66 50 78 72 C66 94 36 94 22 72 Z" fill="#5ab7d8"/>
    <path d="M78 72 L92 58 v28 Z" fill="#3d8fb0"/>
    <circle cx="38" cy="68" r="4" fill="#2b2b33"/>`),

  rocket: (p) => frame(p, `
    <path d="M50 26 C64 44 66 66 62 88 H38 C34 66 36 44 50 26 Z" fill="#f4f4ec"/>
    <path d="M38 76 L24 96 L38 92 Z" fill="#e0474c"/>
    <path d="M62 76 L76 96 L62 92 Z" fill="#e0474c"/>
    <circle cx="50" cy="56" r="8" fill="#3d8fd9"/>
    <path d="M42 90 q8 22 16 0 Z" fill="#f5a623"/>`),

  camera: (p) => frame(p, `
    <rect x="18" y="52" width="64" height="46" rx="7" fill="#3b4750"/>
    <rect x="38" y="44" width="24" height="10" rx="3" fill="#3b4750"/>
    <circle cx="50" cy="75" r="16" fill="#7f8f9c"/><circle cx="50" cy="75" r="9" fill="#22303a"/>
    <circle cx="70" cy="60" r="4" fill="#f5d76e"/>`),

  brush: (p) => frame(p, `
    <rect x="44" y="26" width="12" height="46" rx="4" fill="#a8763a" transform="rotate(18 50 50)"/>
    <path d="M38 76 h24 l-4 22 h-16 Z" fill="#d8d2c0" transform="rotate(18 50 86)"/>
    <path d="M40 96 q10 16 20 0 Z" fill="#e0474c" transform="rotate(18 50 96)"/>`),

  gear: (p) => frame(p, `
    <g fill="#9aaab6">
      <circle cx="50" cy="72" r="26"/>
      ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="45" y="36" width="10" height="14" rx="2" transform="rotate(${a} 50 72)"/>`).join('')}
    </g>
    <circle cx="50" cy="72" r="11" fill="${p.bg[1]}"/>`),

  egg: (p) => frame(p, `
    <ellipse cx="50" cy="76" rx="26" ry="32" fill="#f7f2e2"/>
    <ellipse cx="42" cy="64" rx="8" ry="11" fill="#fff"/>`),

  cup: (p, o) => frame(p, `
    <path d="M30 50 h40 l-5 54 h-30 Z" fill="${o.color || '#e0474c'}"/>
    <rect x="26" y="44" width="48" height="10" rx="4" fill="#f4f4ec"/>
    <path d="M40 60 v34 M52 60 v34 M64 60 v34" stroke="rgba(255,255,255,.45)" stroke-width="4"/>`),

  bowl: (p) => frame(p, `
    <path d="M22 70 h56 a28 28 0 0 1 -56 0 Z" fill="#e0474c"/>
    <path d="M28 62 q10 -12 22 -4 q10 -8 22 4" stroke="#f5d76e" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M34 46 q4 -10 0 -16 M50 44 q4 -10 0 -16 M66 46 q4 -10 0 -16" stroke="rgba(255,255,255,.5)" stroke-width="3" fill="none"/>`),

  bus: (p) => frame(p, `
    <rect x="16" y="48" width="68" height="46" rx="8" fill="#f5c518"/>
    <rect x="24" y="56" width="20" height="16" rx="3" fill="#8fd0f0"/>
    <rect x="56" y="56" width="20" height="16" rx="3" fill="#8fd0f0"/>
    <circle cx="32" cy="98" r="9" fill="#2b2b33"/><circle cx="68" cy="98" r="9" fill="#2b2b33"/>`),

  tooth: (p) => frame(p, `
    <path d="M28 50 q22 -10 44 0 q6 26 -6 54 q-8 10 -12 -12 q-4 -14 -8 0 q-4 22 -12 12 q-12 -28 -6 -54 Z" fill="#f7f2e2"/>`),

  mountain: (p) => frame(p, `
    <path d="M10 106 L38 52 L54 78 L66 60 L90 106 Z" fill="#6e7f8c"/>
    <path d="M38 52 L48 70 h-20 Z" fill="#f4f4ec"/>
    <path d="M66 60 L74 74 h-16 Z" fill="#f4f4ec"/>`),

  cloud: (p) => frame(p, `
    <g fill="#f2f6f8">
      <circle cx="38" cy="76" r="18"/><circle cx="58" cy="70" r="22"/><circle cx="72" cy="80" r="14"/>
      <rect x="34" y="78" width="42" height="16" rx="8"/>
    </g>`),

  bell: (p) => frame(p, `
    <path d="M50 34 a22 22 0 0 1 22 22 v22 l8 10 h-60 l8 -10 v-22 a22 22 0 0 1 22 -22 Z" fill="#eac058"/>
    <circle cx="50" cy="96" r="7" fill="#c99a24"/>
    <circle cx="50" cy="30" r="5" fill="#c99a24"/>`),

  wine: (p) => frame(p, `
    <path d="M34 40 h32 v14 a16 16 0 0 1 -32 0 Z" fill="#8f2f34"/>
    <path d="M34 40 h32 v6 h-32 Z" fill="#f4f4ec" opacity=".35"/>
    <rect x="47" y="68" width="6" height="24" fill="#d8d2c0"/>
    <rect x="34" y="92" width="32" height="6" rx="3" fill="#d8d2c0"/>`),

  cardfan: (p) => frame(p, `
    <g>
      <rect x="24" y="52" width="30" height="44" rx="4" fill="#f4f4ec" transform="rotate(-18 39 74)"/>
      <rect x="35" y="48" width="30" height="44" rx="4" fill="#fdfdf5"/>
      <rect x="46" y="52" width="30" height="44" rx="4" fill="#f4f4ec" transform="rotate(18 61 74)"/>
      <path d="M55 62 l6 8 -6 8 -6 -8 Z" fill="#e0474c"/>
    </g>`),

  glass: (p) => frame(p, `
    <path d="M30 44 h40 l-6 32 h-28 Z" fill="rgba(200,240,255,.55)" stroke="#cfe9ff" stroke-width="2"/>
    <path d="M42 82 h16 l-2 22 h-12 Z" fill="rgba(200,240,255,.4)"/>
    <path d="M36 96 h28" stroke="#cfe9ff" stroke-width="4" stroke-linecap="round"/>`),

  trophy: (p) => frame(p, `
    <path d="M34 40 h32 v20 a16 16 0 0 1 -32 0 Z" fill="#eac058"/>
    <path d="M34 44 h-10 v8 a10 10 0 0 0 10 8 M66 44 h10 v8 a10 10 0 0 1 -10 8" stroke="#eac058" stroke-width="5" fill="none"/>
    <rect x="46" y="76" width="8" height="14" fill="#c99a24"/>
    <rect x="34" y="90" width="32" height="10" rx="3" fill="#c99a24"/>`),

  obelisk: (p) => frame(p, `
    <path d="M42 26 L58 26 L64 100 H36 Z" fill="#a8967a"/>
    <path d="M50 26 L58 26 L64 100 H50 Z" fill="rgba(0,0,0,.18)"/>
    <path d="M44 46 h12 M44 58 h12 M44 70 h12" stroke="rgba(0,0,0,.3)" stroke-width="3"/>`),

  hourglass: (p) => frame(p, `
    <path d="M30 38 h40 v8 L54 72 L70 98 v8 H30 v-8 L46 72 L30 46 Z" fill="#d8cdb4"/>
    <path d="M38 46 h24 L50 66 Z" fill="#f5c518"/>
    <path d="M50 78 L62 98 H38 Z" fill="#f5c518"/>`),

  anchor: (p) => frame(p, `
    <circle cx="50" cy="40" r="8" fill="none" stroke="#cfe9ff" stroke-width="6"/>
    <path d="M50 48 V102 M30 62 h40" stroke="#cfe9ff" stroke-width="7" stroke-linecap="round"/>
    <path d="M26 82 a24 24 0 0 0 48 0" fill="none" stroke="#cfe9ff" stroke-width="7" stroke-linecap="round"/>`),

  boot: (p) => frame(p, `
    <path d="M36 34 h18 v40 q0 8 10 10 l14 6 q6 3 6 10 v6 H36 Z" fill="#8a5a2a"/>
    <rect x="32" y="102" width="56" height="10" rx="4" fill="#4a3018"/>
    <path d="M40 44 h12 M40 56 h12" stroke="rgba(255,255,255,.28)" stroke-width="3"/>`),

  trousers: (p) => frame(p, `
    <path d="M32 36 h36 l4 68 h-16 l-6 -40 l-6 40 h-16 Z" fill="#3d6fa8"/>
    <path d="M32 44 h36" stroke="rgba(255,255,255,.3)" stroke-width="4"/>`),

  banana: (p) => frame(p, `
    <path d="M26 46 q6 44 48 52 q10 2 6 -8 q-32 -8 -40 -46 q-4 -10 -14 2 Z" fill="#f5d24c"/>
    <path d="M30 50 q8 38 44 46" stroke="rgba(0,0,0,.18)" stroke-width="4" fill="none"/>`),

  popcorn: (p) => frame(p, `
    <path d="M30 66 h40 l-5 40 h-30 Z" fill="#e0474c"/>
    <path d="M30 66 h40 l-5 40 h-30 Z" fill="url(#none)"/>
    <path d="M38 66 v40 M50 66 v40 M62 66 v40" stroke="#fff" stroke-width="5"/>
    <g fill="#f7f0d8">
      <circle cx="38" cy="56" r="10"/><circle cx="52" cy="48" r="11"/><circle cx="64" cy="58" r="9"/>
    </g>`),

  target: (p) => frame(p, `
    <circle cx="50" cy="72" r="30" fill="#f4f4ec"/>
    <circle cx="50" cy="72" r="21" fill="#e0474c"/>
    <circle cx="50" cy="72" r="12" fill="#f4f4ec"/>
    <circle cx="50" cy="72" r="5" fill="#e0474c"/>`),

  scroll: (p) => frame(p, `
    <rect x="26" y="40" width="48" height="64" rx="4" fill="#f2ead2"/>
    <rect x="22" y="36" width="56" height="10" rx="5" fill="#c9b98a"/>
    <rect x="22" y="98" width="56" height="10" rx="5" fill="#c9b98a"/>
    <path d="M34 58 h32 M34 70 h32 M34 82 h22" stroke="#a89970" stroke-width="3"/>`),
};

// ---------------------------------------------------------------------------
// Per-joker art assignments
// ---------------------------------------------------------------------------
// Anything not listed falls back to a jester derived from its key, so every
// Joker gets art whether or not it is called out here.

const SUIT_ART = (suit, palette, color) => ({ motif: 'suit', suit, palette, color });

export const JOKER_ART = {
  joker: { jester: { palette: 'red', hat: 'three', face: 'grin' } },
  greedy_joker: SUIT_ART('D', 'orange', '#f5a623'),
  lusty_joker: SUIT_ART('H', 'red', '#e2445c'),
  wrathful_joker: SUIT_ART('S', 'slate', '#dbe6ee'),
  gluttonous_joker: SUIT_ART('C', 'green', '#8fe0a0'),
  jolly: { jester: { palette: 'gold', hat: 'three', face: 'grin' } },
  zany: { jester: { palette: 'purple', hat: 'two', face: 'wide' } },
  mad: { jester: { palette: 'red', hat: 'two', face: 'frown' } },
  crazy: { jester: { palette: 'pink', hat: 'tall', face: 'wide' } },
  droll: { jester: { palette: 'teal', hat: 'cap', face: 'wink' } },
  sly: { jester: { palette: 'blue', hat: 'cap', face: 'wink' } },
  wily: { jester: { palette: 'orange', hat: 'two', face: 'wink' } },
  clever: { jester: { palette: 'teal', hat: 'cap', face: 'smile' } },
  devious: { jester: { palette: 'purple', hat: 'tall', face: 'wink' } },
  crafty: { jester: { palette: 'green', hat: 'cap', face: 'smile' } },
  half: { jester: { palette: 'slate', hat: 'three', face: 'blank' } },
  banner: { motif: 'ticket', palette: 'red' },
  mystic_summit: { motif: 'mountain', palette: 'blue' },
  misprint: { jester: { palette: 'pink', hat: 'two', face: 'wide' } },
  raised_fist: { motif: 'hand', palette: 'red' },
  scary_face: { jester: { palette: 'slate', hat: 'none', face: 'wide' } },
  abstract_joker: { motif: 'gem', palette: 'purple', color: '#c58ff2' },
  gros_michel: { motif: 'banana', palette: 'gold' },
  even_steven: { motif: 'dice', palette: 'blue' },
  odd_todd: { motif: 'dice', palette: 'red' },
  scholar: { motif: 'book', palette: 'blue', color: '#2f5f9a' },
  business: { motif: 'ticket', palette: 'slate' },
  supernova: { motif: 'star', palette: 'purple', color: '#f5d76e' },
  ride_the_bus: { motif: 'bus', palette: 'gold' },
  runner: { motif: 'boot', palette: 'green' },
  ice_cream: { motif: 'cup', palette: 'pink', color: '#f7dfe8' },
  splash: { motif: 'drop', palette: 'blue' },
  blue_joker: { jester: { palette: 'blue', hat: 'three', face: 'blank' } },
  faceless: { jester: { palette: 'slate', hat: 'cap', face: 'blank' } },
  green_joker: { jester: { palette: 'green', hat: 'three', face: 'smile' } },
  superposition: { motif: 'gem', palette: 'teal', color: '#7ff2e0' },
  to_do_list: { motif: 'scroll', palette: 'gold' },
  cavendish: { motif: 'banana', palette: 'green' },
  square: { motif: 'dice', palette: 'slate' },
  riff_raff: { jester: { palette: 'orange', hat: 'two', face: 'grin' } },
  photograph: { motif: 'camera', palette: 'slate' },
  reserved_parking: { motif: 'ticket', palette: 'blue' },
  mail_in_rebate: { motif: 'scroll', palette: 'blue' },
  hallucination: { motif: 'eye', palette: 'purple' },
  shoot_the_moon: { motif: 'moon', palette: 'blue' },
  swashbuckler: { motif: 'anchor', palette: 'red' },
  chaos_clown: { jester: { palette: 'pink', hat: 'three', face: 'wide' } },
  delayed_gratification: { motif: 'hourglass', palette: 'gold' },
  egg: { motif: 'egg', palette: 'bone' },
  popcorn: { motif: 'popcorn', palette: 'red' },
  walkie_talkie: { motif: 'gear', palette: 'green' },
  credit_card: { motif: 'ticket', palette: 'gold' },
  golden: { motif: 'coin', palette: 'gold' },
  juggler: { jester: { palette: 'teal', hat: 'three', face: 'smile' } },
  drunkard: { motif: 'wine', palette: 'red' },
  troubadour: { jester: { palette: 'purple', hat: 'tall', face: 'smile' } },
  merry_andy: { jester: { palette: 'pink', hat: 'three', face: 'grin' } },
  stuntman: { jester: { palette: 'orange', hat: 'none', face: 'shades' } },

  four_fingers: { motif: 'hand', palette: 'purple', fingers: 'four' },
  shortcut: { motif: 'bolt', palette: 'gold' },
  mime: { jester: { palette: 'slate', hat: 'none', face: 'blank' } },
  ceremonial_dagger: { motif: 'bolt', palette: 'red' },
  marble: { motif: 'gem', palette: 'slate', color: '#9aaab6' },
  loyalty_card: { motif: 'ticket', palette: 'teal' },
  eight_ball: { motif: 'target', palette: 'slate' },
  dusk: { motif: 'moon', palette: 'orange' },
  fortune_teller: { motif: 'gem', palette: 'purple', color: '#b47ff2' },
  steel_joker: { motif: 'gear', palette: 'slate' },
  hack: { motif: 'bolt', palette: 'green' },
  pareidolia: { motif: 'eye', palette: 'teal' },
  space: { motif: 'rocket', palette: 'blue' },
  burglar: { jester: { palette: 'slate', hat: 'cap', face: 'shades' } },
  blackboard: { motif: 'book', palette: 'slate', color: '#22303a' },
  sixth_sense: { motif: 'eye', palette: 'purple' },
  constellation: { motif: 'star', palette: 'blue', color: '#cfe9ff' },
  hiker: { motif: 'boot', palette: 'orange' },
  card_sharp: { motif: 'cardfan', palette: 'red' },
  madness: { jester: { palette: 'purple', hat: 'two', face: 'wide' } },
  seance: { motif: 'gem', palette: 'teal', color: '#a0f2e8' },
  vampire: { jester: { palette: 'red', hat: 'none', face: 'grin' } },
  hologram: { motif: 'gem', palette: 'pink', color: '#f2a0e0' },
  vagabond: { jester: { palette: 'bone', hat: 'tall', face: 'frown' } },
  baron: { jester: { palette: 'gold', hat: 'crown', face: 'blank' } },
  cloud_9: { motif: 'cloud', palette: 'blue' },
  rocket: { motif: 'rocket', palette: 'red' },
  midas_mask: { jester: { palette: 'gold', hat: 'crown', face: 'blank' } },
  luchador: { jester: { palette: 'red', hat: 'none', face: 'wide' } },
  gift_card: { motif: 'ticket', palette: 'pink' },
  turtle_bean: { motif: 'gem', palette: 'green', color: '#7fd0a0' },
  erosion: { motif: 'mountain', palette: 'bone' },
  to_the_moon: { motif: 'moon', palette: 'purple' },
  stone_joker: { motif: 'obelisk', palette: 'slate' },
  lucky_cat: { motif: 'cat', palette: 'gold' },
  baseball: { motif: 'target', palette: 'red' },
  bull: { motif: 'coin', palette: 'red' },
  diet_cola: { motif: 'cup', palette: 'slate', color: '#3b4750' },
  trading_card: { motif: 'cardfan', palette: 'blue' },
  flash_card: { motif: 'bolt', palette: 'pink' },
  spare_trousers: { motif: 'trousers', palette: 'blue' },
  ramen: { motif: 'bowl', palette: 'orange' },
  seltzer: { motif: 'glass', palette: 'teal' },
  castle: { motif: 'obelisk', palette: 'blue' },
  mr_bones: { motif: 'skull', palette: 'slate' },
  acrobat: { jester: { palette: 'pink', hat: 'two', face: 'grin' } },
  sock_and_buskin: { jester: { palette: 'purple', hat: 'none', face: 'grin' } },
  certificate: { motif: 'scroll', palette: 'teal' },
  smeared_joker: { motif: 'drop', palette: 'red', color: '#e2445c' },
  throwback: { motif: 'hourglass', palette: 'teal' },
  rough_gem: { motif: 'gem', palette: 'orange', color: '#f5a623' },
  bloodstone: { motif: 'gem', palette: 'red', color: '#e2445c' },
  arrowhead: { motif: 'gem', palette: 'slate', color: '#cfd8e0' },
  onyx_agate: { motif: 'gem', palette: 'green', color: '#2f3a2f' },
  glass_joker: { motif: 'glass', palette: 'blue' },
  showman: { jester: { palette: 'gold', hat: 'tall', face: 'grin' } },
  flower_pot: { motif: 'cup', palette: 'green', color: '#a8763a' },
  oops_all_6s: { motif: 'dice', palette: 'pink' },
  the_idol: { motif: 'obelisk', palette: 'gold' },
  seeing_double: { motif: 'eye', palette: 'green' },
  matador: { jester: { palette: 'red', hat: 'crown', face: 'wink' } },
  hit_the_road: { motif: 'bus', palette: 'slate' },
  duo: { motif: 'cardfan', palette: 'green' },
  trio: { motif: 'cardfan', palette: 'purple' },
  family: { motif: 'cardfan', palette: 'orange' },
  order: { motif: 'cardfan', palette: 'teal' },
  tribe: { motif: 'cardfan', palette: 'gold' },

  dna: { motif: 'gem', palette: 'green', color: '#8fe0a0' },
  blueprint: { motif: 'scroll', palette: 'blue' },
  brainstorm: { motif: 'bolt', palette: 'purple' },
  invisible_joker: { jester: { palette: 'slate', hat: 'three', face: 'blank' } },
  drivers_license: { motif: 'ticket', palette: 'green' },
  cartomancer: { motif: 'cardfan', palette: 'purple' },
  astronomer: { motif: 'planet', palette: 'blue' },
  burnt_joker: { motif: 'flame', palette: 'orange' },
  bootstraps: { motif: 'boot', palette: 'bone' },
  satellite: { motif: 'planet', palette: 'slate', color: '#9aaab6' },
  obelisk: { motif: 'obelisk', palette: 'gold' },
  wee_joker: { jester: { palette: 'teal', hat: 'cap', face: 'smile' } },
  the_duo_x: { motif: 'gear', palette: 'gold' },

  canio: { jester: { palette: 'purple', hat: 'three', face: 'frown' } },
  triboulet: { jester: { palette: 'red', hat: 'crown', face: 'grin' } },
  yorick: { motif: 'skull', palette: 'bone' },
  chicot: { jester: { palette: 'gold', hat: 'three', face: 'wink' } },
  perkeo: { motif: 'wine', palette: 'purple' },
};

// ---------------------------------------------------------------------------
// Consumable art
// ---------------------------------------------------------------------------

const PLANET_COLORS = {
  pluto: ['#b0a0c0', '#6a5f7a'], mercury: ['#c8c0b0', '#8a8478'], uranus: ['#8fd8e0', '#4a9aa8'],
  venus: ['#e8c07a', '#a8823c'], saturn: ['#e0c88f', '#a8904c'], jupiter: ['#d89a6a', '#a06a40'],
  earth: ['#5aa8e0', '#2f6a9a'], mars: ['#d85a3a', '#93321c'], neptune: ['#5a7ae0', '#2f4a9a'],
  planetx: ['#9a6ae0', '#5a3a9a'], ceres: ['#a8a89a', '#6a6a5c'], eris: ['#c0c0d8', '#7a7a92'],
};

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
  'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

function planetArt(key) {
  const [body, shade] = PLANET_COLORS[key] || ['#8fb8e8', '#4a6a9a'];
  const g = gid();
  return `
    <defs><radialGradient id="${g}" cx="0.35" cy="0.3">
      <stop offset="0" stop-color="${body}"/><stop offset="1" stop-color="${shade}"/>
    </radialGradient></defs>
    <rect width="100" height="140" fill="#101a33"/>
    ${[[16, 22], [82, 30], [24, 116], [76, 108], [50, 18], [88, 76], [12, 70]]
      .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1.5 + (i % 3) * 0.8}" fill="#e8f0ff" opacity=".8"/>`).join('')}
    <circle cx="50" cy="70" r="28" fill="url(#${g})"/>
    <ellipse cx="50" cy="72" rx="46" ry="11" fill="none" stroke="#d8c890" stroke-width="4" opacity=".85" transform="rotate(-20 50 72)"/>`;
}

function tarotArt(key, index) {
  const g = gid();
  const hue = (hash(key) % 360);
  return `
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hsl(hue, 45, 34)}"/><stop offset="1" stop-color="${hsl(hue, 50, 16)}"/>
    </linearGradient></defs>
    <rect width="100" height="140" fill="url(#${g})"/>
    <rect x="8" y="8" width="84" height="124" rx="6" fill="none" stroke="${hsl(hue, 60, 72)}" stroke-width="3"/>
    <circle cx="50" cy="62" r="26" fill="none" stroke="${hsl(hue, 65, 78)}" stroke-width="3"/>
    <path d="M50 40 L58 62 L50 84 L42 62 Z" fill="${hsl(hue, 70, 80)}"/>
    <circle cx="50" cy="62" r="7" fill="${hsl(hue, 40, 25)}"/>
    <text x="50" y="118" font-size="20" font-weight="900" text-anchor="middle"
      fill="${hsl(hue, 65, 82)}" font-family="serif">${ROMAN[index % ROMAN.length]}</text>`;
}

function spectralArt(key) {
  const g = gid();
  return `
    <defs><radialGradient id="${g}" cx="0.5" cy="0.4">
      <stop offset="0" stop-color="#2f6a72"/><stop offset="1" stop-color="#10262c"/>
    </radialGradient></defs>
    <rect width="100" height="140" fill="url(#${g})"/>
    <path d="M28 108 V64 a22 22 0 0 1 44 0 v44 l-9 -8 l-8 8 l-9 -8 l-9 8 l-9 -8 Z" fill="#bfe8ea" opacity=".9"/>
    <circle cx="41" cy="70" r="5" fill="#10262c"/><circle cx="59" cy="70" r="5" fill="#10262c"/>
    <ellipse cx="50" cy="86" rx="7" ry="9" fill="#10262c"/>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function wrap(inner, extraClass = '') {
  return `<svg class="art ${extraClass}" viewBox="${VIEW}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
}

export function jokerArt(key, rarity = 'common') {
  const spec = JOKER_ART[key];
  const inner = spec && spec.motif && MOTIFS[spec.motif]
    ? MOTIFS[spec.motif](paletteFor(key, spec.palette), spec)
    : jester(key, (spec && spec.jester) || {});
  return banded(rarity, inner);
}

const KIND_BAND = {
  tarot: { fill: '#7b4fb5', ink: '#f2e6ff', label: 'TAROT' },
  planet: { fill: '#2f6ab5', ink: '#e2f0ff', label: 'PLANET' },
  spectral: { fill: '#2f8f92', ink: '#e0fbfa', label: 'SPECTRAL' },
  common: { fill: '#3f78c4', ink: '#e6f1ff', label: 'JOKER' },
  uncommon: { fill: '#2f9460', ink: '#e2fbee', label: 'JOKER' },
  rare: { fill: '#c4453f', ink: '#ffe6e4', label: 'JOKER' },
  legendary: { fill: '#8f56c4', ink: '#f4e6ff', label: 'JOKER' },
  voucher: { fill: '#b8862c', ink: '#fff3d6', label: 'VOUCHER' },
};

// Every consumable wears its type on a coloured band, so a Tarot is never
// mistaken for a Planet in a crowded tray.
function banded(kind, inner) {
  const b = KIND_BAND[kind] || KIND_BAND.tarot;
  const clip = gid();
  return wrap(`
    <rect width="100" height="140" rx="8" fill="${b.fill}"/>
    <defs><clipPath id="${clip}"><rect x="4" y="4" width="92" height="116" rx="5"/></clipPath></defs>
    <g clip-path="url(#${clip})">
      <g transform="translate(4,4) scale(0.92,0.83)">${inner}</g>
    </g>
    <rect x="4" y="4" width="92" height="116" rx="5" fill="none" stroke="${b.ink}" stroke-width="2"/>
    <text x="50" y="135" font-size="15" fill="${b.ink}" font-family="inherit" text-anchor="middle">${b.label}</text>`);
}

export function consumableArt(card, index = 0) {
  if (card.kind === 'planet') return banded('planet', planetArt(card.key));
  if (card.kind === 'spectral') return banded('spectral', spectralArt(card.key));
  return banded('tarot', tarotArt(card.key, index));
}

// Boosters get a wrapper illustration keyed off what is inside them.
export function packArt(kind) {
  const looks = {
    tarot: { bg: ['#6b3f9e', '#331d52'], accent: '#d9b8ff' },
    planet: { bg: ['#2f5f9a', '#152f52'], accent: '#bcd9ff' },
    playing: { bg: ['#9a2f3a', '#4f161d'], accent: '#ffc9c9' },
    joker: { bg: ['#b0562a', '#5c2a12'], accent: '#ffd9a8' },
    spectral: { bg: ['#2b6a6a', '#123434'], accent: '#b8f0ea' },
  }[kind] || { bg: ['#3d4c55', '#212a31'], accent: '#dbe6ee' };
  const g = gid();
  return wrap(`
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${looks.bg[0]}"/><stop offset="1" stop-color="${looks.bg[1]}"/>
    </linearGradient></defs>
    <rect width="100" height="140" fill="url(#${g})"/>
    <path d="M0 26 h100 v6 H0 Z M0 108 h100 v6 H0 Z" fill="rgba(255,255,255,.18)"/>
    <g transform="translate(0,4)">
      <rect x="24" y="50" width="28" height="42" rx="4" fill="${looks.accent}" transform="rotate(-14 38 71)"/>
      <rect x="48" y="50" width="28" height="42" rx="4" fill="#fdfdf5" transform="rotate(12 62 71)"/>
    </g>
    <path d="M12 12 l6 10 l-6 10 l-6 -10 Z M88 116 l6 10 l-6 10 l-6 -10 Z" fill="${looks.accent}" opacity=".7"/>`);
}

/* A perforated cinema ticket. The word itself lives on the band at the foot
   of the card like every other kind, rather than being squeezed across the
   stub where it is unreadable at tray size. */
export function voucherArt() {
  const g = gid();
  return banded('voucher', `
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8a5f18"/><stop offset="1" stop-color="#4a3208"/>
    </linearGradient></defs>
    <rect width="100" height="140" fill="url(#${g})"/>
    <path d="M16 34 h68 v26 a11 11 0 0 0 0 22 v26 H16 V82 a11 11 0 0 0 0 -22 Z" fill="#f6e3b4"/>
    <path d="M50 38 v12 m0 9 v12 m0 9 v12 m0 9 v12" stroke="#c9a860" stroke-width="3" stroke-dasharray="5 6"/>
    <circle cx="33" cy="62" r="9" fill="none" stroke="#b8862c" stroke-width="3"/>
    <path d="M28 62 h10 M33 57 v10" stroke="#b8862c" stroke-width="3"/>
    <path d="M62 54 h14 M62 64 h14 M62 74 h9" stroke="#c9a860" stroke-width="4" stroke-linecap="round"/>
    <path d="M24 96 h52" stroke="#b8862c" stroke-width="3" stroke-dasharray="6 5"/>`);
}

export function tagArt(emoji) {
  const g = gid();
  return wrap(`
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8eef2"/><stop offset="1" stop-color="#b8c8d4"/>
    </linearGradient></defs>
    <path d="M8 8 h56 l28 28 v96 a8 8 0 0 1 -8 8 H16 a8 8 0 0 1 -8 -8 Z" fill="url(#${g})"/>
    <circle cx="50" cy="66" r="20" fill="#22303a"/>
    <text x="50" y="76" font-size="24" text-anchor="middle">${emoji}</text>`);
}
