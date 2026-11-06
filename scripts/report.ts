/**
 * Builds docs/balance.md and docs/balance-chart.svg from fresh simulations.
 *   npm run report
 */
import { writeFileSync } from 'node:fs';
import { amber, cyan, grass, olive, tomato } from '@radix-ui/colors';
import {
  BALANCE,
  CLASSES,
  CREATURES,
  DIFFICULTY_NAMES,
  ERAS,
  createState,
  formatNumber,
  type Difficulty,
} from '../src/core/index.ts';
import { PROFILES, simulate, type RunLog } from './simulate.ts';

const LABEL: Record<string, string> = {
  engaged: '投入型：常驻页面，最优购买，用主动技能',
  casual: '休闲型：每 45 秒看一次，用主动技能',
  idle: '挂机型：每 3 分钟看一次，不用主动技能，不点防守技能',
};
const COLOR: Record<string, string> = { engaged: grass.grass9, casual: cyan.cyan9, idle: amber.amber10 };
const CLASS_CN: Record<string, string> = Object.fromEntries(Object.values(CLASSES).map((c) => [c.id, c.name]));
const PREY_CN: Record<string, string> = Object.fromEntries(CREATURES.map((c) => [c.id, c.name]));

const min = (t: number | null) => (t === null ? '—' : `${Math.round(t / 60)} 分钟`);

function chart(runs: RunLog[]): string {
  const W = 880;
  const H = 400;
  const pad = { l: 52, r: 24, t: 48, b: 46 };
  const maxT = Math.ceil(Math.max(...runs.map((r) => r.time)) / 600) * 10;
  const x = (t: number) => pad.l + (t / 60 / maxT) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - v * (H - pad.t - pad.b);
  const bill = Math.log10(BALANCE.difficulty.normal.bill);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12">`,
    `<rect width="${W}" height="${H}" fill="${olive.olive1}"/>`,
    `<text x="${pad.l}" y="26" font-size="15" font-weight="600" fill="${olive.olive12}">普通难度：账单进度（实线）与人类研究（虚线）</text>`,
  ];
  for (let v = 0; v <= 1.0001; v += 0.25) {
    parts.push(
      `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${olive.olive6}"/>`,
      `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" fill="${olive.olive11}">${Math.round(v * 100)}%</text>`,
    );
  }
  for (let t = 0; t <= maxT; t += 10) {
    parts.push(`<text x="${x(t * 60)}" y="${H - pad.b + 20}" text-anchor="middle" fill="${olive.olive11}">${t}m</text>`);
  }
  runs.forEach((r, i) => {
    const color = COLOR[r.profile] ?? olive.olive9;
    const progress = r.samples.map((s) => `${x(s.t).toFixed(1)},${y(Math.min(1, s.earned / bill)).toFixed(1)}`).join(' ');
    const research = r.samples.map((s) => `${x(s.t).toFixed(1)},${y(s.research).toFixed(1)}`).join(' ');
    parts.push(
      `<polyline points="${progress}" fill="none" stroke="${color}" stroke-width="2"/>`,
      `<polyline points="${research}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>`,
      `<circle cx="${x(r.time)}" cy="${y(r.won ? 1 : r.research)}" r="5" fill="${r.won ? color : tomato.tomato9}"/>`,
    );
    const ly = H - pad.b - 64 + i * 18;
    parts.push(
      `<line x1="${W - 200}" x2="${W - 180}" y1="${ly}" y2="${ly}" stroke="${color}" stroke-width="2"/>`,
      `<text x="${W - 172}" y="${ly + 4}" fill="${olive.olive12}">${r.profile}</text>`,
    );
  });
  parts.push(`<text x="${pad.l}" y="${H - 10}" fill="${olive.olive11}">实心点：结束时刻。红点表示被人类反制。</text>`, '</svg>');
  return parts.join('\n');
}

function row(r: RunLog): string {
  const cms = r.countermeasures.map((c) => `${CLASS_CN[c.cls]} ${min(c.t)}`).join('、') || '无';
  const def = r.defected.map((d) => `${PREY_CN[d.id]} ${min(d.t)}`).join('、') || '无';
  return `| ${DIFFICULTY_NAMES[r.difficulty]} | ${r.profile} | ${r.won ? '胜' : '负'} ${min(r.time)} | ${min(r.eras[2] ?? null)} / ${min(r.eras[3] ?? null)} / ${min(r.eras[4] ?? null)} | ${Math.round(r.research * 100)}% | ${cms} | ${def} | ${r.points} |`;
}

function main() {
  const diffs: Difficulty[] = ['normal', 'hard', 'brutal'];
  const plain = diffs.flatMap((d) => PROFILES.map((p) => simulate(p, d)));
  const perks = { perk_growth: 3, perk_quiet: 3, perk_wild: 2, perk_savings: 2 };
  const veteran = (['hard', 'brutal'] as Difficulty[]).flatMap((d) =>
    PROFILES.slice(0, 2).map((p) => {
      const s = createState();
      s.meta.levels = { ...perks };
      return simulate(p, d, 'beasts', s);
    }),
  );
  writeFileSync(new URL('../docs/balance-chart.svg', import.meta.url), chart(plain.filter((r) => r.difficulty === 'normal')));

  const head = '| 难度 | 玩家 | 结果 | 古代 / 工业 / 现代 | 研究 | 人类反制 | 跳反 | 局外点数 |\n|---|---|---|---|---|---|---|---|';
  const creatureRows = CREATURES.map(
    (c) =>
      `| ${ERAS[c.era].name} | ${c.name} | ${CLASS_CN[c.cls]} | $${formatNumber(c.baseCost)} | ${formatNumber(c.baseProd)}/秒 | ${c.tame ? '可驯化' : c.ancient ? '远古巨兽' : ''} |`,
  ).join('\n');

  const R = BALANCE.research;
  const md = `# 数值平衡报告

> 由 \`npm run report\` 生成，规则见 [design.md](design.md)。数值改动后重跑。

## 结论

目标：一局 40 到 90 分钟；普通难度认真玩能赢，放着不管会输；困难和残酷要靠局外成长。三种机器人用真实的逻辑核心打完整局：

${Object.entries(LABEL).map(([k, v]) => `- **${k}**：${v}`).join('\n')}

### 没有局外成长

${head}
${plain.map(row).join('\n')}

### 局外天性满级（多产 3、低调 3、野性 2、囤粮 2）

${head}
${veteran.map(row).join('\n')}

机器人不会选分叉 B，也不会主动换路线，真人在困难和残酷下还有更多手段。

![普通难度曲线](balance-chart.svg)

## 对抗规则的数值

| 项目 | 取值 |
|---|---|
| 研究速度 | ${R.base}/秒 × 难度 × 时代（${R.eraMult.join(' / ')}）× (${R.progressFloor} + ${R.progressWeight} × 账单进度) × 技能 |
| 反制节点 | 研究到 ${R.thresholds.map((t) => `${t * 100}%`).join('、')} 时，针对产出最高的兵种 −${R.countermeasure * 100}% × (1 − 抗性) |
| 兵种抗性 | ${Object.values(CLASSES).map((c) => `${c.name} ${c.resist}`).join('，')} |
| 驯化速度 | 满曝光（拥有 ${BALANCE.domestication.fullExposure} 只）时 ${BALANCE.domestication.base}/秒 × 时代 × 难度，有狗再 ×${1 + BALANCE.domestication.dogBoost} |
| 远古巨兽 | 每落后一个时代产出 ×${BALANCE.obsolete} |
| 账单 | 普通 $${formatNumber(BALANCE.difficulty.normal.bill)}，困难 $${formatNumber(BALANCE.difficulty.hard.bill)}，残酷 $${formatNumber(BALANCE.difficulty.brutal.bill)} |

## 生物配置表

| 时代 | 生物 | 兵种 | 基础价 | 基础产出 | 备注 |
|---|---|---|---|---|---|
${creatureRows}

## 怎么调

- 整体快慢：\`balance.ts\` 的 \`tiers\`（相邻生物的价格和产出倍率）。
- 对抗强度：\`research.base\` 和各难度的 \`research\`。
- 驯化压力：\`domestication.base\`。
- 难度梯度：\`difficulty\` 下的账单和倍率。
`;
  writeFileSync(new URL('../docs/balance.md', import.meta.url), md);
  console.log(plain.map(row).join('\n'));
  console.log(veteran.map(row).join('\n'));
}

main();
