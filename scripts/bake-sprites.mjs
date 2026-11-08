/**
 * Bakes every model into the pixel sprite atlas (public/sprites/atlas.png + atlas.json).
 *
 *   npm run sprites                 # everything
 *   npm run sprites -- unit/wolf    # only keys starting with these prefixes (writes to a preview file)
 *
 * Hand-made sprites in art/sprites/<key>/<anim><n>.png (e.g. art/sprites/unit/wolf/move0.png)
 * replace the baked ones for that key, after the same palette snap and outline. See docs/art-style.md.
 *
 * Starts Vite, opens bake.html in headless Chromium (Playwright) and saves what the page produces.
 * The look (camera, light, palette, outline) lives in src/bake/bake.ts and src/pixel/specs.ts.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Playwright is resolved like CommonJS so a globally installed copy works too (npm i -D playwright otherwise).
const { chromium } = createRequire(import.meta.url)('playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const outDir = join(root, 'public/sprites');

/** Every PNG under art/sprites, as paths relative to the project root. */
function overrides(dir = join(root, 'art/sprites'), rel = 'art/sprites') {
  let out = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(overrides(full, `${rel}/${name}`));
    else if (/\.png$/i.test(name)) out.push(`${rel}/${name}`);
  }
  return out;
}

const server = await createServer({ root, logLevel: 'warn', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.addInitScript((list) => {
    window.__bakeOverrides = list;
  }, overrides());
  await page.goto(`${url}bake.html${only.length ? `?only=${only.join(',')}` : ''}`);
  await page.waitForFunction(() => window.__bake, null, { timeout: 600_000, polling: 500 });
  const result = await page.evaluate(() => window.__bake);
  if (result.error) throw new Error(result.error);
  for (const line of result.log) console.log(line);
  mkdirSync(outDir, { recursive: true });
  const name = only.length ? 'preview' : 'atlas';
  const png = Buffer.from(result.png.split(',')[1], 'base64');
  writeFileSync(join(outDir, `${name}.png`), png);
  const json = result.json;
  json.meta.image = `${name}.png`;
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(json));
  console.log(`wrote public/sprites/${name}.png (${(png.length / 1024).toFixed(0)} KB), ${Object.keys(json.frames).length} frames`);
} finally {
  await browser.close();
  await server.close();
}
