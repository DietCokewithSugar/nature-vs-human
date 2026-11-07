import type { DisasterId, UnitClass, ZoneId } from '../types.ts';

export interface DisasterDef {
  id: DisasterId;
  name: string;
  /** The zone it strikes. Lairs there are wrecked, except those of the class that profits. */
  zone: ZoneId;
  /** Seconds of warning before it hits. */
  warn: number;
  /** Seconds it lasts once it hits. */
  duration: number;
  /** The class that rides it out and profits while it lasts. */
  boost: { cls: UnitClass; x: number };
  /** Share of the zone's non-boosted lairs it wrecks (the tornado only cuts a path). */
  wreck: number;
  /** Research knocked back when the humans are fully built up in the zone. */
  research: number;
  /** How built up the humans are in the zone, per era: nobody lives on the ice-age coast. */
  exposure: readonly [number, number, number, number];
}

export const DISASTERS: Record<DisasterId, DisasterDef> = {
  tsunami: {
    id: 'tsunami',
    name: '海啸',
    zone: 'coast',
    warn: 15,
    duration: 30,
    boost: { cls: 'marine', x: 3 },
    wreck: 1,
    research: 0.04,
    exposure: [0, 0.25, 1, 1],
  },
  tornado: {
    id: 'tornado',
    name: '龙卷风',
    zone: 'plains',
    warn: 12,
    duration: 25,
    boost: { cls: 'swarm', x: 2 },
    wreck: 0.5,
    research: 0.03,
    exposure: [0.1, 0.5, 0.8, 1],
  },
  volcano: {
    id: 'volcano',
    name: '火山爆发',
    zone: 'volcano',
    warn: 20,
    duration: 40,
    boost: { cls: 'tank', x: 2 },
    wreck: 1,
    research: 0.03,
    exposure: [0, 0, 0.4, 0.7],
  },
};
