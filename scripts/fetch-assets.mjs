/**
 * Downloads the models listed in assets.manifest.json, compresses them with
 * meshopt into public/models, and regenerates the attribution files.
 *
 *   npm run assets            # fetch missing models only
 *   npm run assets -- --force # refetch everything
 *
 * Downloads land in a fresh temp directory; nothing downloaded is executed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'scripts/assets.manifest.json'), 'utf8'));
const outDir = join(root, 'public/models');
const force = process.argv.includes('--force');
const cli = join(root, 'node_modules/@gltf-transform/cli/bin/cli.js');

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'human-bill-assets-'));

let total = 0;
try {
  for (const asset of manifest.assets) {
    const out = join(outDir, `${asset.name}.glb`);
    if (!force && existsSync(out)) {
      total += statSync(out).size;
      continue;
    }
    const url = manifest.source.download.replace('{slug}', asset.slug);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${asset.slug}: HTTP ${res.status}`);
    const raw = join(tmp, `${asset.name}.raw.glb`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
    execFileSync(
      process.execPath,
      [cli, 'optimize', raw, out, '--compress', 'meshopt', '--texture-compress', 'false', '--simplify', 'false'],
      { stdio: 'ignore' },
    );
    const size = statSync(out).size;
    total += size;
    console.log(`${asset.name.padEnd(18)} ${(statSync(raw).size / 1024).toFixed(0).padStart(6)} KB → ${(size / 1024).toFixed(0).padStart(5)} KB`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);

// ── Attribution ────────────────────────────────────────────────
const { source } = manifest;
const credits = manifest.assets.map((a) => ({
  title: a.title,
  url: source.assetPage.replace('{slug}', a.slug),
}));

writeFileSync(
  join(root, 'src/data/credits.json'),
  JSON.stringify(
    {
      models: { author: source.name, home: source.home, license: source.license, licenseUrl: source.licenseUrl, items: credits },
    },
    null,
    2,
  ) + '\n',
);

const lines = credits.map((c) => `- [${c.title}](${c.url})`).join('\n');
writeFileSync(
  join(root, 'CREDITS.md'),
  `# 致谢

## 3D 模型

以下模型来自 [${source.name}](${source.home})，按 [${source.license}](${source.licenseUrl}) 授权使用。

改动说明：模型经 glTF-Transform 做了网格压缩（meshopt）、动画重采样和去重，几何形状和配色未改。游戏内会对部分模型统一缩放。

${lines}

## 字体

- [ZCOOL KuaiLe 站酷快乐体](https://fonts.google.com/specimen/ZCOOL+KuaiLe)，SIL Open Font License 1.1
- [Fredoka](https://fonts.google.com/specimen/Fredoka)，SIL Open Font License 1.1

## 配色

- [Radix Colors](https://www.radix-ui.com/colors)，MIT License

## 代码库

- [three.js](https://threejs.org)，MIT License
- [Preact](https://preactjs.com)，MIT License
- [break_infinity.js](https://github.com/Patashu/break_infinity.js)，MIT License
- [Supabase JS](https://github.com/supabase/supabase-js)，MIT License
`,
);
console.log('wrote CREDITS.md and src/data/credits.json');
