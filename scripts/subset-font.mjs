/**
 * Cuts the pixel font down to the characters the game actually prints (public/fonts/pixel-ui.woff2).
 * The full Fusion Pixel font stays as a fallback face and only downloads if some text (a nickname,
 * say) needs a character outside the subset.
 *
 *   npm run font      # rerun after changing copy, unit or building names
 */
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules/@fontsource/fusion-pixel-12px-proportional-sc/files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2');

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx|json)$/.test(name) ? [full] : [];
  });
}

// Every character in the source (copy, configs, names) plus printable ASCII and common punctuation.
let text = '';
for (let c = 0x20; c < 0x7f; c++) text += String.fromCharCode(c);
text += '，。！？、：；“”‘’（）《》【】…—·～×÷±≈→←↑↓★☆♥●○◆◇■□▲△▼▽％＋－／０１２３４５６７８９';
for (const f of files(join(root, 'src'))) text += readFileSync(f, 'utf8');
const chars = [...new Set(text)].filter((ch) => ch.codePointAt(0) >= 0x20).join('');

const out = await subsetFont(readFileSync(source), chars, { targetFormat: 'woff2' });
writeFileSync(join(root, 'public/fonts/pixel-ui.woff2'), out);
copyFileSync(source, join(root, 'public/fonts/fusion-pixel-12px.woff2'));
console.log(`pixel-ui.woff2: ${[...chars].length} characters, ${(out.length / 1024).toFixed(1)} KB`);
