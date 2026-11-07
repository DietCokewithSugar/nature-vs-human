/**
 * Builds the project's own models with Blender (tools/blender/models.py) and compresses them
 * with meshopt into public/models, the same way `npm run assets` treats downloaded ones.
 *
 *   pip install bpy==5.2.3          # Blender as a Python module (Python 3.13)
 *   npm run models                  # BLENDER_PYTHON=/path/to/python if bpy lives elsewhere
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const python = process.env.BLENDER_PYTHON ?? 'python3';
const cli = join(root, 'node_modules/@gltf-transform/cli/bin/cli.js');
const outDir = join(root, 'public/models');
const tmp = mkdtempSync(join(tmpdir(), 'human-bill-models-'));

try {
  const log = execFileSync(python, ['-I', join(root, 'tools/blender/models.py'), '--out', tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(log.split('\n').find((l) => l.startsWith('built')) ?? log);
  let total = 0;
  for (const file of readdirSync(tmp).filter((f) => f.endsWith('.glb')).sort()) {
    const out = join(outDir, file);
    execFileSync(
      process.execPath,
      [cli, 'optimize', join(tmp, file), out, '--compress', 'meshopt', '--texture-compress', 'false', '--simplify', 'false'],
      { stdio: 'ignore' },
    );
    const size = statSync(out).size;
    total += size;
    console.log(`${file.padEnd(26)} ${(size / 1024).toFixed(1).padStart(6)} KB`);
  }
  console.log(`total ${(total / 1024).toFixed(0)} KB`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
