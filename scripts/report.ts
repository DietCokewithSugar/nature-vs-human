/**
 * Plays every bot style for a while on several seeds with the real logic core and writes
 * docs/balance.md. Rerun after changing numbers in src/core/config/.
 *
 *   npm run report            (40 minutes per style and seed)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BALANCE, BUILDINGS, Game, UNITS, createState, type CoreEvent } from '../src/core/index.ts';
import { LOOK_EVERY, botLook, type BotStyle } from './bot.ts';

const MINUTES = Number(process.argv[2] ?? 40);
const SEEDS = [20261108, 7, 99];
const STYLES: BotStyle[] = ['engaged', 'casual', 'naive', 'idle'];
const STYLE_NAME: Record<BotStyle, string> = {
  engaged: '投入型：每 5 秒看一眼，先养草再出兵，按计划搭配，钱多就升级',
  casual: '休闲型：每 45 秒看一眼，打法同上',
  naive: '新手型：每 20 秒看一眼，随手买买得起的建筑，偶尔升级',
  idle: '挂机型：每 3 分钟看一眼，打法同投入型',
};

interface Run {
  stage: number;
  minutes: number;
}

interface Result {
  runs: Run[];
  best: number;
  firstClear: number[];
  stageTimes: Map<number, number[]>;
  genes: number;
}

function play(style: BotStyle, seed: number): Result {
  const game = new Game(createState());
  game.startRun(seed);
  const res: Result = { runs: [], best: 0, firstClear: [], stageTimes: new Map(), genes: 0 };
  let stageStart = 0;
  let runStart = 0;
  game.on((e: CoreEvent) => {
    const t = game.state.meta.playTime;
    if (e.type === 'stageWon') {
      const list = res.stageTimes.get(e.stage) ?? [];
      list.push(t - stageStart);
      res.stageTimes.set(e.stage, list);
      if (res.firstClear[e.stage] === undefined) res.firstClear[e.stage] = t;
    }
    if (e.type === 'stageStarted') stageStart = t;
    if (e.type === 'runEnded') {
      res.runs.push({ stage: e.result.stage, minutes: (t - runStart) / 60 });
      runStart = t;
    }
  });
  let next = 0;
  for (let t = 0; t < MINUTES * 60; t++) {
    if (t >= next) {
      botLook(game, style);
      next = t + LOOK_EVERY[style];
    }
    if (game.run.phase !== 'battle') {
      botLook(game, style);
      // botLook may have started a run or a stage (TypeScript can't see the phase change).
      if ((game.run.phase as string) === 'battle' && game.run.stageTime < 1) {
        botLook(game, style);
        next = t + LOOK_EVERY[style];
      }
    }
    game.advance(1);
  }
  res.best = game.state.meta.bestStage;
  res.genes = game.state.meta.lifetimeGenes;
  return res;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const mmss = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '—');

const lines: string[] = [];
lines.push('# 数值平衡报告', '');
lines.push('> 由 `npm run report` 生成，规则见 [design.md](design.md)。改了 `src/core/config/` 的数值以后重跑。', '');
lines.push('## 目标', '');
lines.push('- 第 1 关谁都能过：新手随手点、挂机三分钟看一次，都能赢下第一关。');
lines.push('- 认真玩的一轮能打到第 5 到第 8 关，前几关 1 到 3 分钟一关，越往后越久。');
lines.push('- 卡住以后靠回归大地拿基因、买天赋，下一轮走得更远。', '');
lines.push(`每种玩家在 ${SEEDS.length} 个种子上各玩 ${MINUTES} 分钟（游戏时间），用真实的逻辑核心，输了就买天赋、开下一轮：`, '');
for (const s of STYLES) lines.push(`- **${s}**：${STYLE_NAME[s]}`);
lines.push('', '## 结果', '');
lines.push('| 玩家 | 种子 | 轮数 | 每轮打到第几关 | 最高通关 | 累计基因 |', '|---|---|---|---|---|---|');
const all = new Map<BotStyle, Result[]>();
for (const style of STYLES) {
  const rs: Result[] = [];
  for (const seed of SEEDS) {
    const r = play(style, seed);
    rs.push(r);
    lines.push(`| ${style} | ${seed} | ${r.runs.length} | ${r.runs.map((x) => x.stage).join('、') || '—'} | ${r.best} | ${r.genes} |`);
  }
  all.set(style, rs);
}
lines.push('', '## 每关用时（平均）', '');
lines.push('| 玩家 | 第 1 关 | 第 2 关 | 第 3 关 | 第 4 关 | 第 5 关 | 第 6 关 | 第 7 关 |', '|---|---|---|---|---|---|---|---|');
for (const style of STYLES) {
  const rs = all.get(style)!;
  const cells = [1, 2, 3, 4, 5, 6, 7].map((n) => mmss(avg(rs.flatMap((r) => r.stageTimes.get(n) ?? []))));
  lines.push(`| ${style} | ${cells.join(' | ')} |`);
}
lines.push('', '## 关键数值', '');
lines.push('| 项目 | 取值 |', '|---|---|');
lines.push(`| 自然开局 | 生机 ${BALANCE.nature.start}；母树 ${BUILDINGS.mothertree.hp} 血，每秒 ${BUILDINGS.mothertree.income} 生机 |`);
lines.push(`| 人类开局 | 物资 ${BALANCE.human.start}（每关 +${BALANCE.human.startPerStage}）；部落大帐 ${BUILDINGS.lodge.hp} 血，每关 ×${BALANCE.human.mainHpGrowth} |`);
lines.push(`| 人类变强 | 每关起始等级 +${BALANCE.human.levelsPerStage}；每 ${BALANCE.human.researchPeriod} 秒改良工具 +1 级；每级血量和攻击 ×${1 + BALANCE.levelPower} |`);
lines.push(`| 自然升级 | 每级血量和攻击 ×${1 + BALANCE.levelPower}；价格每级 ×${BALANCE.levelCostGrowth} |`);
lines.push(`| 食物链 | 草场每座产草 ${BUILDINGS.meadow.grass}/秒（每级 ×${1 + BALANCE.meadowPerLevel}）；吃草：蚂蚁 ${UNITS.ant.eat}、鹿 ${UNITS.elk.eat}、猛犸 ${UNITS.mammoth.eat}；产肉：蚂蚁 ${UNITS.ant.meat}、鹿 ${UNITS.elk.meat}、猛犸 ${UNITS.mammoth.meat}；吃肉：狼 ${UNITS.wolf.eat}、剑齿虎 ${UNITS.sabertooth.eat}、熊 ${UNITS.bear.eat} |`);
lines.push(`| 领地 | 每段地每秒 ${BALANCE.nature.perSegment} 生机，温泉另加 ${BALANCE.nature.spring} |`);
lines.push('');

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'balance.md');
writeFileSync(out, lines.join('\n'));
console.log(lines.join('\n'));
