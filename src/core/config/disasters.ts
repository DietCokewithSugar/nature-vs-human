import type { DisasterId, UnitClass, ZoneId } from '../types.ts';

export interface DisasterDef {
  id: DisasterId;
  name: string;
  /** The zone it strikes (see map/grid.ts). Everything there takes damage except the class that profits. */
  zone: ZoneId;
  /** Seconds of warning before it hits. */
  warn: number;
  /** Seconds it rages. */
  duration: number;
  /** The class that rides it out and hits harder while it lasts. */
  boost: { cls: UnitClass; x: number };
}

export const DISASTERS: Record<DisasterId, DisasterDef> = {
  tsunami: { id: 'tsunami', name: '海啸', zone: 'coast', warn: 15, duration: 30, boost: { cls: 'marine', x: 3 } },
  tornado: { id: 'tornado', name: '龙卷风', zone: 'plains', warn: 12, duration: 25, boost: { cls: 'swarm', x: 2 } },
  volcano: { id: 'volcano', name: '火山爆发', zone: 'volcano', warn: 20, duration: 35, boost: { cls: 'tank', x: 2 } },
};
