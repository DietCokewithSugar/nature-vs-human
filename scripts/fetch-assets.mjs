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

改动说明：游戏里看到的动物、建筑、树和道具都是由这些模型渲染、缩小、换成 Resurrect 64 调色板并加描边得到的像素图（见 src/bake/bake.ts）。所有模型经 glTF-Transform 做了网格压缩（meshopt）、动画重采样和去重。以下生物是在 Polyfork 模型基础上改装的：猛犸（Elephant）、剑齿虎 / 老虎 / 野猫（Cat）、洞熊（Bear）、野猪 / 犀牛（Pig）、野牛（Ox）、蝗虫（Meadow grasshopper）、蚊子（Common wasp）、白蚁（Wood ant）。改装内容是重新上色、拉伸比例，并加上程序生成的象牙、獠牙、角和口器（见 src/bake/models/kitbash.ts）。帐篷由代码生成。人物是代码画的像素小人（src/bake/people.ts），不来自模型。

${lines}

本项目自制的模型：老窝（蚁丘、狼窝、岩洞、冰川谷、花丛、鼠洞、灌木丛、密林、泥潭、芦苇、死水塘、鸟巢树、枯树、礁石、草原、白蚁丘、猴面包树）、火山、人类前哨站（瞭望塔、风力发电机、钻井平台、矿井、地热站）和小道具（草丛、蕨类、野花、藤蔓、树桩、围栏、木材堆），由 Blender 脚本 tools/blender/models.py 生成。

## 字体

- [缝合像素字体 Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)（12px 比例，简体中文），作者 TakWolf，SIL Open Font License 1.1。界面只打包用到的字（public/fonts/pixel-ui.woff2），完整字体作为后备

## 调色板

- [Resurrect 64](https://lospec.com/palette-list/resurrect-64)，作者 [Kerrie Lake](https://lospec.com/kerrielake)：地图、精灵和界面的每个像素都来自这 64 种颜色

## 代码库

- [PixiJS](https://pixijs.com)，MIT License
- [Preact](https://preactjs.com)，MIT License
- [break_infinity.js](https://github.com/Patashu/break_infinity.js)，MIT License
- [Supabase JS](https://github.com/supabase/supabase-js)，MIT License
- 开发工具（不进游戏包）：[three.js](https://threejs.org)（烘焙像素图）、[Radix Colors](https://www.radix-ui.com/colors)（模型改色），MIT License
`,
);
console.log('wrote CREDITS.md and src/data/credits.json');
