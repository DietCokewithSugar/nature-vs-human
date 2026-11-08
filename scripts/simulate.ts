/**
 * Plays whole runs with the scripted bots and prints how far each gets.
 *   npm run sim            (default: 40 minutes per style, seed 20261108)
 *   npm run sim -- 60 7    (60 minutes, seed 7)
 */
import { Game, createState, type CoreEvent } from '../src/core/index.ts';
import { LOOK_EVERY, botLook, type BotStyle } from './bot.ts';

const minutes = Number(process.argv[2] ?? 40);
const seed = Number(process.argv[3] ?? 20261108);

for (const style of ['engaged', 'casual', 'idle', 'naive'] as BotStyle[]) {
  const game = new Game(createState());
  game.startRun(seed);
  const log: string[] = [];
  let stageStart = 0;
  game.on((e: CoreEvent) => {
    const t = game.state.meta.playTime;
    if (e.type === 'stageWon') {
      log.push(`  ${fmt(t)}  第 ${e.stage} 关胜（用时 ${fmt(t - stageStart)}）`);
      stageStart = t;
    }
    if (e.type === 'runEnded') {
      log.push(`  ${fmt(t)}  一轮结束：打到第 ${e.result.stage} 关，基因 +${e.result.genes}`);
    }
    if (e.type === 'stageStarted') stageStart = t;
  });
  let next = 0;
  const total = minutes * 60;
  for (let t = 0; t < total; t += 1) {
    if (t >= next) {
      botLook(game, style);
      next = t + LOOK_EVERY[style];
    }
    if (game.run.phase !== 'battle') {
      botLook(game, style);
      // A fresh run or stage: a player builds straight away.
      // botLook may have started a run or a stage (TypeScript can't see the phase change).
      if ((game.run.phase as string) === 'battle' && game.run.stageTime < 1) {
        botLook(game, style);
        next = t + LOOK_EVERY[style];
      }
    }
    game.advance(1);
  }
  const r = game.run;
  console.log(`${style}: 第 ${r.stage} 关进行中，最佳通关 ${game.state.meta.bestStage}，轮数 ${game.state.meta.runs}，单位 ${r.units.length}，生机 ${Math.floor(r.essence)}`);
  for (const l of log) console.log(l);
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}
