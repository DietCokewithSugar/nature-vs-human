/**
 * Builds docs/balance.md and docs/balance-chart.svg from fresh simulations.
 *   npm run report
 */
import { writeFileSync } from 'node:fs';
import { amber, cyan, grass, olive, tomato } from '@radix-ui/colors';
import { BALANCE, CLASSES, DIFFICULTY_NAMES, DISASTERS, ERAS, UNITS, ZONES, type Difficulty, type EraId } from '../src/core/index.ts';
import { PROFILES, PROFILE_NOTES, runBot, type RunSummary } from './simulate.ts';

const SEED = 20261108;
const COLOR: Record<string, string> = { engaged: grass.grass9, casual: cyan.cyan9, idle: amber.amber10 };
const min = (t: number | undefined | null) => (t === undefined || t === null || Number.isNaN(t) ? '—' : `${Math.round(t / 60)} 分钟`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function chart(runs: RunSummary[]): string {
  const W = 880;
  const H = 400;
  const pad = { l: 52, r: 24, t: 48, b: 46 };
  const maxT = Math.ceil(Math.max(...runs.map((r) => r.time)) / 600) * 10;
  const x = (t: number) => pad.l + (t / 60 / maxT) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - v * (H - pad.t - pad.b);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12">`,
    `<rect width="${W}" height="${H}" fill="${olive.olive1}"/>`,
    `<text x="${pad.l}" y="26" font-size="15" font-weight="600" fill="${olive.olive12}">普通难度：自然领地（实线）与人类研究进度（虚线，四个时代）</text>`,
  ];
  for (let v = 0; v <= 1.0001; v += 0.25) {
    parts.push(
      `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${olive.olive6}"/>`,
      `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" fill="${olive.olive11}">${Math.round(v * 100)}%</text>`,
    );
  }
  const win = BALANCE.territory.winShare;
  parts.push(`<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(win)}" y2="${y(win)}" stroke="${grass.grass9}" stroke-dasharray="2 3"/>`);
  for (let t = 0; t <= maxT; t += 10) {
    parts.push(`<text x="${x(t * 60)}" y="${H - pad.b + 20}" text-anchor="middle" fill="${olive.olive11}">${t}m</text>`);
  }
  runs.forEach((r, i) => {
    const color = COLOR[r.profile] ?? olive.olive9;
    const share = r.samples.map((s) => `${x(s.t).toFixed(1)},${y(s.nature).toFixed(1)}`).join(' ');
    const research = r.samples.map((s) => `${x(s.t).toFixed(1)},${y(s.research / 4).toFixed(1)}`).join(' ');
    parts.push(
      `<polyline points="${share}" fill="none" stroke="${color}" stroke-width="2"/>`,
      `<polyline points="${research}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="5 4"/>`,
      `<circle cx="${x(r.time)}" cy="${y(r.won ? r.final : r.research / 4)}" r="5" fill="${r.won ? color : tomato.tomato9}"/>`,
    );
    const ly = pad.t + 10 + i * 18;
    parts.push(
      `<line x1="${W - 200}" x2="${W - 180}" y1="${ly}" y2="${ly}" stroke="${color}" stroke-width="2"/>`,
      `<text x="${W - 172}" y="${ly + 4}" fill="${olive.olive12}">${r.profile}</text>`,
    );
  });
  parts.push(`<text x="${pad.l}" y="${H - 10}" fill="${olive.olive11}">点：结束时刻。红点表示人类研究完成（输）。绿色点线：65% 胜利线。</text>`, '</svg>');
  return parts.join('\n');
}

function row(r: RunSummary): string {
  const eras = ([2, 3, 4] as EraId[]).map((e) => min(r.eras[e])).join(' / ');
  const cms = r.countermeasures.map((c) => `${CLASSES[c.cls as keyof typeof CLASSES].name} ${min(c.at)}`).join('、') || '无';
  const def = r.defected.map((d) => UNITS[d as keyof typeof UNITS].name).join('、') || '无';
  return `| ${DIFFICULTY_NAMES[r.difficulty]} | ${r.profile} | ${r.won ? '胜' : '负'} ${min(r.time)} | ${eras} | ${pct(r.best)} | ${cms} | ${def} | ${r.kills} / ${r.lost} / ${r.aged} | ${r.built} / ${r.wrecked} / ${r.razed} | ${r.bubbles} | ${r.points} |`;
}

interface Summary {
  difficulty: Difficulty;
  profile: string;
  wins: number;
  runs: number;
  winTime: number;
  lossTime: number;
  best: number;
}

function summarise(difficulty: Difficulty, profile: string, runs: RunSummary[]): Summary {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const wins = runs.filter((r) => r.won);
  return {
    difficulty,
    profile,
    wins: wins.length,
    runs: runs.length,
    winTime: avg(wins.map((r) => r.time)),
    lossTime: avg(runs.filter((r) => !r.won).map((r) => r.time)),
    best: avg(runs.map((r) => r.best)),
  };
}

function main() {
  const diffs: Difficulty[] = ['normal', 'hard', 'brutal'];
  const seeds = Number(process.argv[2] ?? 4);
  const plain = diffs.flatMap((d) => PROFILES.map((p) => runBot(p, { difficulty: d, seed: SEED })));
  const summaries: Summary[] = [];
  for (const d of diffs) {
    for (const p of PROFILES) {
      const runs = Array.from({ length: seeds }, (_, i) => (i === 0 ? plain.find((r) => r.difficulty === d && r.profile === p.name)! : runBot(p, { difficulty: d, seed: SEED + i * 7919 })));
      summaries.push(summarise(d, p.name, runs));
    }
  }
  const perks = { perk_growth: 3, perk_long: 2, perk_quiet: 3, perk_wild: 2, perk_savings: 2 };
  const veteran = (['hard', 'brutal'] as Difficulty[]).flatMap((d) => PROFILES.slice(0, 2).map((p) => runBot(p, { difficulty: d, seed: SEED, meta: perks })));
  writeFileSync(new URL('../docs/balance-chart.svg', import.meta.url), chart(plain.filter((r) => r.difficulty === 'normal')));

  const head =
    '| 难度 | 玩家 | 结果 | 古代 / 工业 / 现代 | 最高领地 | 人类反制 | 被驯化 | 击杀 / 战损 / 老死 | 自建 / 被拆 / 拆人类 | 点泡泡 | 局外点数 |\n|---|---|---|---|---|---|---|---|---|---|---|';
  const R = BALANCE.research;
  const T = BALANCE.territory;
  const E = BALANCE.economy;
  const md = `# 数值平衡报告

> 由 \`npm run report\` 生成，规则见 [design.md](design.md)。数值改动后重跑。

## 结论

目标：一局 40 到 60 分钟，四个时代都要经历；普通难度认真玩能赢，放着不管会输；困难和残酷要靠局外成长。三种机器人用真实的逻辑核心打完整局：

${PROFILES.map((p) => `- **${p.name}**：${PROFILE_NOTES[p.name]}`).join('\n')}

机器人买建筑的策略很朴素：钱够就按价格从贵到便宜买（每种不超过「时代数 + 1」座），放在离人类最近的自己领地上，剩下的钱升级，技能按固定顺序学。真人会选地方、插集结旗、搭配效果建筑，打得比它好。

### ${seeds} 个种子的平均

| 难度 | 玩家 | 胜率 | 平均获胜用时 | 平均失败用时 | 平均最高领地 |
|---|---|---|---|---|---|
${summaries.map((s) => `| ${DIFFICULTY_NAMES[s.difficulty]} | ${s.profile} | ${s.wins}/${s.runs} | ${min(s.winTime)} | ${min(s.lossTime)} | ${pct(s.best)} |`).join('\n')}

### 单局明细（种子 ${SEED}）

${head}
${plain.map(row).join('\n')}

### 局外天性满级（多产 3、长寿 2、低调 3、野性 2、囤粮 2）

${head}
${veteran.map(row).join('\n')}

![普通难度曲线](balance-chart.svg)

## 关键数值

| 项目 | 取值 |
|---|---|
| 一天 | ${BALANCE.day} 秒，开局 ${BALANCE.startHour}:00；夜里是 19:00 到 5:30 |
| 领地 | 控制值 −${T.max}（人类）到 +${T.max}（自然），越过 ±${T.flip} 换主；没人动时每秒向原主人回 ${T.recover}；中立地抵抗 ×${T.neutralResist} |
| 胜负 | 现代时期占当前地图可占地块的 ${pct(T.winShare)}，或拆光人类所有建筑 → 胜；人类研究满 4 段，或自然建筑全灭 → 负 |
| 自然之元 | 开局 ${E.natureStart}；每块自然领地每秒 +${E.naturePerCell}；资源点每 ${E.bubble.gap[0]}–${E.bubble.gap[1]} 秒冒一个泡泡，价值 ${E.bubble.value.join(' / ')}（按时代），${E.bubble.life} 秒后消失 |
| 人类收入 | 基础 ${E.humanBase.join(' / ')}（按时代）+ 每块地 ${E.humanPerCell} + 每个资源点 ${E.humanPerNode} + 建筑收入 + 家猪 ${E.pigIncome} + 飞机 ${E.planeIncome}；自然占地超过 ${pct(E.panicFrom)} 后再 × (1 + ${E.panicWeight} × 超出部分) |
| 建筑上限 | 自然 ${BALANCE.caps.natureBase} + 每 ${BALANCE.caps.naturePerCells} 块领地 1 座；人类 ${BALANCE.caps.humanBase} + 每 ${BALANCE.caps.humanPerCells} 块 1 座 |
| 人口上限 | 自然 ${BALANCE.caps.naturePop}（授粉者不算），人类 ${BALANCE.caps.humanPop} |
| 建造 | ${BALANCE.build.base} 秒 + 价格 ÷ ${BALANCE.build.perCost}；中立地 ×${BALANCE.build.wild}，敌方领地（地下通道）×${BALANCE.build.enemy} |
| 研究 | (${R.base} + 每级实验室 ${R.perLab} + 每个学者/研究员 ${R.perScholar}) × (${R.pressureFloor} + ${R.pressureWeight} × 自然占地) × 难度 ÷ 时代价（${R.eraCost.join(' / ')}）；现代之前自然已过 ${pct(T.winShare)} 时再 ×${R.rush} |
| 反制 | 每段研究过半时针对攻击力最高的兵种：攻击 −${R.countermeasure * 100}% × (1 − 抗性)；抗性 ${Object.values(CLASSES).map((c) => `${c.name} ${c.resist}`).join('，')} |
| 驯化 | 每抓走一只 +${BALANCE.domestication.capture * 100}%，猎人每杀一只 +${BALANCE.domestication.kill * 100}% |
| 回血 | 脱战 ${BALANCE.units.regenDelay} 秒后每秒 ${BALANCE.units.regen * 100}%；休息 ${BALANCE.units.restRegen * 100}%，觅食 ${BALANCE.units.forageRegen * 100}%；吃到猎物时回复伤害的 ${BALANCE.units.lifesteal * 100}% |
| 灾难 | ${ERAS[BALANCE.disasters.fromEra as 2].name}起，首次在 ${BALANCE.disasters.first} 秒后预警，之后每 ${BALANCE.disasters.gap[0] / 60} 到 ${BALANCE.disasters.gap[1] / 60} 分钟一次；灾区里的单位每秒掉 ${BALANCE.disasters.damage * 100}% 血 |

## 灾难

| 灾难 | 灾区 | 预警 / 持续 | 获益（不受伤） |
|---|---|---|---|
${Object.values(DISASTERS)
  .map((d) => `| ${d.name} | ${ZONES[d.zone].name} | ${d.warn} 秒 / ${d.duration} 秒 | ${CLASSES[d.boost.cls].name}攻击 ×${d.boost.x} |`)
  .join('\n')}

## 怎么调

- 一局长短：\`research\` 下的速度和 \`eraCost\`；胜利线 \`territory.winShare\`。
- 双方强弱：\`config/units.ts\` 的血量、攻击、寿命和克制倍率；\`economy\` 下双方的收入。
- 前期压力：人类的 \`humanBase\` 和开局建筑（\`map/grid.ts\` 的 \`PRESETS\`）。
- 拉锯手感：\`territory.recover\`、\`research.pressureWeight\`、\`economy.panicWeight\`。
`;
  writeFileSync(new URL('../docs/balance.md', import.meta.url), md);
  console.log(plain.map(row).join('\n'));
  console.log(summaries.map((s) => `${s.difficulty} ${s.profile} ${s.wins}/${s.runs} win ${min(s.winTime)} loss ${min(s.lossTime)}`).join('\n'));
}

main();
