/**
 * Builds docs/balance.md and docs/balance-chart.svg from a fresh simulation.
 *   npm run report
 */
import { writeFileSync } from 'node:fs';
import { amber, cyan, grass, olive } from '@radix-ui/colors';
import { BALANCE, CREATURES, ERAS, UPGRADE_BY_ID, formatNumber } from '../src/core/index.ts';
import { COST_STEP, PROD_STEP } from '../src/core/config/creatures.ts';
import { PROFILES, simulate, type SimResult } from './simulate.ts';

const PROFILE_LABEL: Record<string, string> = {
  engaged: '投入型：常驻页面，最优购买，按收益峰值进化',
  casual: '休闲型：每分钟看一次，偶尔点击和放大潮',
  idle: '挂机型：每 5 分钟看一次，几乎不点击',
};
const PROFILE_COLOR: Record<string, string> = {
  engaged: grass.grass9,
  casual: cyan.cyan9,
  idle: amber.amber10,
};

function hours(t: number | null): string {
  if (t === null) return '—';
  return t < 3600 ? `${Math.round(t / 60)} 分钟` : `${(t / 3600).toFixed(1)} 小时`;
}

function chart(results: SimResult[]): string {
  const W = 880;
  const H = 420;
  const pad = { l: 56, r: 24, t: 48, b: 48 };
  const maxH = Math.ceil(Math.max(...results.map((r) => (r.endedAt ?? r.samples.at(-1)!.t) / 3600))) + 1;
  const maxY = Math.ceil(Math.max(...results.flatMap((r) => r.samples.map((s) => s.lifetime))) / 4) * 4;
  const x = (t: number) => pad.l + ((t / 3600) / maxH) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12">`,
    `<rect width="${W}" height="${H}" fill="${olive.olive1}"/>`,
    `<text x="${pad.l}" y="26" font-size="15" font-weight="600" fill="${olive.olive12}">累计破坏额随游戏时长增长（log10，美元）</text>`,
  );
  for (let v = 0; v <= maxY; v += 4) {
    parts.push(
      `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${olive.olive6}" stroke-width="1"/>`,
      `<text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" fill="${olive.olive11}">1e${v}</text>`,
    );
  }
  for (let hh = 0; hh <= maxH; hh += 2) {
    parts.push(`<text x="${x(hh * 3600)}" y="${H - pad.b + 20}" text-anchor="middle" fill="${olive.olive11}">${hh}h</text>`);
  }
  results.forEach((r, i) => {
    const color = PROFILE_COLOR[r.profile] ?? olive.olive9;
    const pts = r.samples
      .filter((s) => r.endedAt === null || s.t <= r.endedAt + 120)
      .map((s) => `${x(s.t).toFixed(1)},${y(s.lifetime).toFixed(1)}`)
      .join(' ');
    parts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`);
    for (const era of [2, 3, 4] as const) {
      const t = r.eraFirst[era];
      if (t == null) continue;
      const s = r.samples.find((p) => p.t >= t) ?? r.samples.at(-1)!;
      parts.push(`<circle cx="${x(t)}" cy="${y(s.lifetime)}" r="4" fill="${olive.olive1}" stroke="${color}" stroke-width="2"/>`);
    }
    if (r.endedAt !== null) {
      const s = r.samples.find((p) => p.t >= r.endedAt!) ?? r.samples.at(-1)!;
      parts.push(`<circle cx="${x(r.endedAt)}" cy="${y(s.lifetime)}" r="5" fill="${color}"/>`);
    }
    const ly = H - pad.b - 64 + i * 18;
    parts.push(
      `<line x1="${W - 236}" x2="${W - 216}" y1="${ly}" y2="${ly}" stroke="${color}" stroke-width="2"/>`,
      `<text x="${W - 208}" y="${ly + 4}" fill="${olive.olive12}">${r.profile}</text>`,
    );
  });
  parts.push(
    `<text x="${pad.l}" y="${H - 10}" fill="${olive.olive11}">空心点：首次进入海啸、兽群、远古　实心点：结局</text>`,
    '</svg>',
  );
  return parts.join('\n');
}

function main() {
  const results = PROFILES.map((p) => simulate(p));
  writeFileSync(new URL('../docs/balance-chart.svg', import.meta.url), chart(results));

  const rows = results
    .map(
      (r) =>
        `| ${r.profile} | ${hours(r.eraFirst[2] ?? null)} | ${hours(r.eraFirst[3] ?? null)} | ${hours(r.eraFirst[4] ?? null)} | ${hours(r.endedAt)} | ${r.evolutions.filter((e) => r.endedAt === null || e.t <= r.endedAt).length} |`,
    )
    .join('\n');

  const creatureRows = CREATURES.map(
    (c) =>
      `| ${ERAS[c.era].name} | ${c.name} | $${formatNumber(c.baseCost)} | ${formatNumber(c.baseProd)}/秒 | ${formatNumber(c.baseCost / c.baseProd)} 秒 |`,
  ).join('\n');

  const ending = UPGRADE_BY_ID['ending']!;
  const md = `# 数值平衡报告

> 由 \`npm run report\` 生成。数值改动后重跑，这份报告和图会一起更新。

## 结论

目标：中篇，首次通关 10 到 20 小时。三种机器人玩家用真实的逻辑核心从零玩到结局：

| 玩家 | 进入海啸 | 进入兽群 | 进入远古 | 结局 | 结局前进化次数 |
|---|---|---|---|---|---|
${rows}

${results.map((r) => `- **${r.profile}**：${PROFILE_LABEL[r.profile]}`).join('\n')}

机器人买东西从不犹豫，真人通常慢 20% 到 50%，所以真人首通预计在 12 到 20 小时。

![累计破坏额曲线](balance-chart.svg)

## 节奏

- **前 30 分钟**：每 1 到 5 分钟解锁一种新生物或升级。参考 Cookie Clicker：开局几分钟内就有反馈。
- **虫潮 → 海啸**：约 35 到 50 分钟。门票"唤醒大海"的价格等于第一只螃蟹的价格。
- **兽群**：第一次撞墙。第一次进化在 3.5 到 6.5 小时之间，拿到 40 到 600 个基因。
- **远古**：基因开始滚雪球，几次 10 到 30 分钟的短进化就能把数字推高好几个数量级。之后进入软上限区，最后一张账单要靠耐心攒。
- **结局后**：进入无尽模式，排行榜继续累计。

## 核心公式

| 公式 | 取值 | 参考 |
|---|---|---|
| 下一只的价格 = 基础价 × ${BALANCE.costGrowth}^已拥有 | 增长率 ${BALANCE.costGrowth} | Cookie Clicker 建筑 |
| 产出 = 基础产出 × 数量 × 倍率 | 数量 = 购买 + 繁殖 | The Math of Idle Games |
| 拥有 ${BALANCE.milestones.slice(0, 6).join('、')}… 只时产出 ×${BALANCE.milestoneMult} | 共 ${BALANCE.milestones.length} 档 | AdVenture Capitalist 阈值倍率 |
| 相邻生物价格 ×${COST_STEP}，产出 ×${PROD_STEP} | 回本时间每档 ×${(COST_STEP / PROD_STEP).toFixed(2)} | 让高阶生物值得等待 |
| 基因总数 = ⌊∛(累计破坏 / ${formatNumber(BALANCE.genes.base)})⌋ | 立方根 | Cookie Clicker 声望 |
| 每个基因 +${BALANCE.genes.power * 100}% 产出，超过 ${BALANCE.genes.softcap} 个后按 ^${BALANCE.genes.softcapExp} 软上限 | 抑制后期爆炸 | Antimatter Dimensions 软上限 |
| 买最大数量 = ⌊log_r(c(r−1)/(b·r^k) + 1)⌋ | 单一指数成本可用 | The Math of Idle Games |

## 时代机制

- **虫潮·繁殖**：买下"蚁后登基"后，每只购买的昆虫每秒繁殖 ${BALANCE.breeding.ratePerQueen} × 蚁后数 × 繁殖倍率 只。繁殖出的个体不抬价，但会产出。这是"产出的增速本身也在涨"的导数式增长（Antimatter Dimensions）。
- **海啸·潮汐**：海洋生物产出 × (1 + 振幅 × 潮位)，潮位按 ${BALANCE.tide.period} 秒正弦周期在 0 和 1 之间变化。"大潮"让产出 ×${BALANCE.tide.surgeMult} 持续 ${BALANCE.tide.surgeDuration} 秒，冷却 ${BALANCE.tide.surgeCooldown} 秒。后台补算用解析积分，结果和逐帧累加一致。
- **兽群、远古**：专属机制放在第二版。

## 生物配置表

| 时代 | 生物 | 基础价 | 基础产出 | 基础回本 |
|---|---|---|---|---|
${creatureRows}

最后一张账单"${ending.name}"售价 $${formatNumber(Number(ending.cost))}，需要 25 只霸王龙。

## 怎么调

所有数值都在 \`src/core/config/\`：

- 想让整体变快或变慢：改 \`creatures.ts\` 里的 \`COST_STEP\` / \`PROD_STEP\`。
- 想让进化更早或更晚：改 \`balance.ts\` 里的 \`genes.base\`。
- 想改通关时长：改 \`upgrades.ts\` 里 \`ending\` 的价格。

改完运行 \`npm run report\`，看表和图是否还在目标区间。
`;
  writeFileSync(new URL('../docs/balance.md', import.meta.url), md);
  console.log(md.split('\n').slice(0, 14).join('\n'));
}

main();
