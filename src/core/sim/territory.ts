import { BALANCE } from '../config/balance.ts';
import { UNITS } from '../config/units.ts';
import { PADS, SEGMENTS } from '../map/layout.ts';
import type { Lane } from '../types.ts';
import { ownerOf, unitSegment, type Ctx } from './ctx.ts';

/**
 * Units standing on a stretch push it towards their side, unless the other side is standing
 * there too. A stretch with one side's building can't be pushed past neutral by the other.
 */
export function stepTerritory(ctx: Ctx, dt: number): void {
  const run = ctx.run;
  const push = [0, 1, 2].map(() => Array.from({ length: SEGMENTS }, () => ({ nature: 0, human: 0 })));
  for (const u of run.units) {
    if (u.hp <= 0) continue;
    const s = unitSegment(u);
    if (s < 0) continue;
    push[u.lane]![s]![u.side] += UNITS[u.kind].claim;
  }
  const hold = [0, 1, 2].map(() => Array.from({ length: SEGMENTS }, () => ({ nature: false, human: false })));
  for (const b of run.buildings) {
    if (b.pad < 0) continue;
    const pad = PADS[b.pad]!;
    if (pad.seg >= 0) hold[pad.lane]![pad.seg]![b.side] = true;
  }
  const { max, holdBuffer } = BALANCE.territory;
  for (const lane of [0, 1, 2] as Lane[]) {
    const row = run.segments[lane]!;
    for (let s = 0; s < SEGMENTS; s++) {
      const p = push[lane]![s]!;
      const before = row[s]!;
      let c = before;
      if (p.nature > 0 && p.human === 0) c += p.nature * dt;
      else if (p.human > 0 && p.nature === 0) c -= p.human * dt;
      c = Math.max(-max, Math.min(max, c));
      const h = hold[lane]![s]!;
      if (h.nature) c = Math.max(c, -holdBuffer);
      if (h.human) c = Math.min(c, holdBuffer);
      row[s] = c;
      const was = ownerOf(before);
      const now = ownerOf(c);
      if (was !== now) ctx.emit({ type: 'flip', lane, seg: s, owner: now });
    }
  }
}
