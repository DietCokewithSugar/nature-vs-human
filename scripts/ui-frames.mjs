/**
 * Generates src/styles/frames.css: the pixel frames (9-slice, for CSS border-image) and small
 * pixel icons of the UI, drawn here as ASCII art so they stay editable and on the palette.
 *
 *   npm run frames
 *
 * Every frame is an SVG of 1×1 rects with crisp edges, so it scales to whole CSS pixels without
 * blurring. CSS draws them at 2 CSS px per art pixel, the map's scale on phones (see pixel.css).
 * Frame centres are transparent: the element's own background fills them, so one frame works on
 * any colour.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Resurrect 64 entries used by the UI (src/pixel/palette.ts has the full set).
const C = {
  ink: '#2e222f', night: '#3e3546', slate: '#625565', steel: '#9babb2', mist: '#c7dcd0', white: '#ffffff',
  umber: '#4c3e24', rust: '#9e4539', clay: '#cd683d', tan: '#e6904e', straw: '#fbb954', skin: '#fdcbb0', apricot: '#fca790',
  pine: '#165a4c', forest: '#239063', green: '#1ebc73', leaf: '#91db69', lime: '#d5e04b', moss: '#a2a947', olive: '#676633',
  blood: '#6e2727', crimson: '#ae2334', red: '#e83b3b', peach: '#f68181',
  amber: '#f79617', gold: '#f9c22b', lemon: '#fbff86',
  indigo: '#484a77', blue: '#4d65b4', sky: '#4d9be6', ice: '#8fd3ff', navy: '#323353',
  grape: '#6b3e75', violet: '#905ea9', lavender: '#a884f3',
  dusk: '#966c6c', khaki: '#ab947a', lilacGrey: '#7f708a',
};

/** Rows of letters → SVG data URI. Letters map through `legend`; '.' is transparent. */
function svg(rows, legend) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === ch) n++;
      if (ch !== '.' && legend[ch]) rects += `<rect x='${x}' y='${y}' width='${n}' height='1' fill='${legend[ch]}'/>`;
      x += n;
    }
  });
  const doc = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${doc.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')}")`;
}

/**
 * A square frame from concentric rings. `ring(r, side)` gives the colour letter of ring r
 * (0 = outermost) on a side ('tl' top/left, 'br' bottom/right); `notch` cuts the corners.
 */
function ringFrame(s, ring, notch = 2) {
  const n = s * 2 + 1;
  const rows = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      const cx = Math.min(x, n - 1 - x);
      const cy = Math.min(y, n - 1 - y);
      if (cx + cy < notch) {
        row += '.';
        continue;
      }
      // Corner pixels on the notch's diagonal close the outline.
      if (cx + cy === notch && cx < notch && cy < notch) {
        row += ring(0, 'tl');
        continue;
      }
      const r = Math.min(cx, cy);
      if (r >= s) {
        row += '.';
        continue;
      }
      const top = y === r;
      const left = x === r;
      const side = top || left ? (y === n - 1 - r || x === n - 1 - r ? (x < y ? 'tl' : 'br') : 'tl') : 'br';
      row += ring(r, side);
    }
    rows.push(row);
  }
  return rows;
}

const frames = {};
const icons = {};

// Wooden panel (Stardew-like): ink, light wood, wood, wood shadow, dark inner edge. 5 px.
frames.wood = {
  slice: 5,
  img: svg(
    ringFrame(5, (r, side) => ['k', side === 'tl' ? 'h' : 's', 'w', side === 'tl' ? 'w' : 's', 'd'][r], 2),
    { k: C.ink, h: C.tan, w: C.clay, s: C.rust, d: C.umber },
  ),
};

// Paper slot inside a panel: a brown line with a shadow along the top and left. 2 px.
frames.slot = {
  slice: 2,
  img: svg(ringFrame(2, (r, side) => (r === 0 ? 'o' : side === 'tl' ? 'h' : '.'), 1), { o: C.rust, h: C.tan }),
};

// Ink box: a plain 1 px ink outline with notched corners (badges, pictures, small chips).
frames.ink = { slice: 1, img: svg(ringFrame(1, () => 'k', 1), { k: C.ink }) };

// Sunken track for meters: ink outline and an inner shadow on top. 2 px.
frames.track = {
  slice: 2,
  img: svg(ringFrame(2, (r, side) => (r === 0 ? 'k' : side === 'tl' ? 'n' : '.'), 1), { k: C.ink, n: C.night }),
};

/**
 * Buttons: ink outline, a light row on top, two dark rows at the bottom for thickness.
 * Slices: top 2, sides 2, bottom 3. Pressed: the thickness drops to one row.
 */
function button(light, dark, pressed = false) {
  const rows = pressed
    ? ['.kkk.', 'kLLLk', 'k...k', 'kDDDk', '.kkk.']
    : ['.kkk.', 'kLLLk', 'k...k', 'kDDDk', 'kDDDk', '.kkk.'];
  return svg(rows, { k: C.ink, L: light, D: dark });
}

const tones = {
  green: [C.green, C.leaf, C.forest],
  red: [C.red, C.peach, C.crimson],
  gold: [C.gold, C.lemon, C.amber],
  blue: [C.sky, C.ice, C.blue],
  plain: [C.skin, C.white, C.tan],
  wood: [C.clay, C.tan, C.rust],
  grey: [C.mist, C.white, C.steel],
  violet: [C.violet, C.lavender, C.grape],
};

let css = `/* Generated by scripts/ui-frames.mjs — edit the ASCII art there, then npm run frames. */\n:root {\n`;
for (const [name, f] of Object.entries(frames)) {
  css += `  --frame-${name}: ${f.img};\n  --frame-${name}-slice: ${f.slice};\n`;
}
for (const [name, [face, light, dark]] of Object.entries(tones)) {
  css += `  --tone-${name}: ${face};\n  --btn-${name}: ${button(light, dark)};\n  --btn-${name}-down: ${button(light, dark, true)};\n`;
}

// ── Icons ──────────────────────────────────────────────────────

// 自然之元: a green orb with a bright core (the map's bubble, bigger).
icons.essence = svg(
  ['...kkkk...', '..kggggk..', '.kgllwlgk.', 'kgllwwllgk', 'kglwwwwlgk', 'kgllwwllgk', 'kggllllggk', '.kGggggGk.', '..kGGGGk..', '...kkkk...'],
  { k: C.ink, g: C.green, l: C.leaf, w: C.lemon, G: C.forest },
);
// The humans' coin.
icons.coin = svg(
  ['...kkkk...', '..kyyyyk..', '.kyllllyk.', 'kyllyylyak', 'kylyaylyak', 'kylyaylyak', 'kylllllyak', '.kyyyyyak.', '..kaaaak..', '...kkkk...'],
  { k: C.ink, y: C.gold, l: C.lemon, a: C.amber },
);
// Gene points: a green gem.
icons.gem = svg(['...kk...', '..kllk..', '.klgggk.', 'klgggGGk', 'kgggGGGk', '.kgGGGk.', '..kGGk..', '...kk...'], {
  k: C.ink, l: C.leaf, g: C.green, G: C.forest,
});
icons.close = svg(['ww...ww', 'www.www', '.wwwww.', '..www..', '.wwwww.', 'www.www', 'ww...ww'], { w: C.white });
icons.leaf = svg(['.....kk', '...kkgk', '..kglgk', '.kglgk.', 'kgglk..', 'klgk...', 'kk.....'], { k: C.ink, g: C.green, l: C.leaf });
icons.lock = svg(['..kkk..', '.k...k.', '.k...k.', 'kkkkkkk', 'kyyyyyk', 'kyykyyk', 'kyykyyk', 'kyyyyyk', 'kkkkkkk'], { k: C.ink, y: C.gold });
icons.star = svg(['...k...', '..kyk..', 'kkkykkk', 'kyyyyyk', '.kyyyk.', 'kyk.kyk', 'kk...kk'], { k: C.ink, y: C.gold });
icons.sun = svg(['..kkkk..', '.kyyyyk.', 'kyllyyyk', 'kylyyyak', 'kyyyyyak', 'kyyyyaak', '.kaaaak.', '..kkkk..'], {
  k: C.ink, y: C.gold, l: C.lemon, a: C.amber,
});
icons.moon = svg(['..kkkk..', '.kwwmmk.', 'kwwmk...', 'kwmk....', 'kwmk....', 'kwwmk...', '.kwwmmk.', '..kkkk..'], {
  k: C.ink, w: C.white, m: C.mist,
});

for (const [name, img] of Object.entries(icons)) css += `  --icon-${name}: ${img};\n`;
css += '}\n';

writeFileSync(join(root, 'src/styles/frames.css'), css);
console.log(`frames.css: ${Object.keys(frames).length} frames, ${Object.keys(tones).length} button tones, ${Object.keys(icons).length} icons`);
