import type { Countermeasure, RunResult } from '../state.ts';
import type { ActiveId, BuildingId, CreatureId, DisasterId, DomesticId, EraId, Side, UnitId } from '../types.ts';

export type DeathCause = 'fight' | 'age' | 'capture' | 'disaster' | 'trap' | 'strike';

export type CoreEvent =
  | { type: 'unitBorn'; id: number; kind: UnitId; side: Side; home: number }
  | { type: 'unitDied'; id: number; kind: UnitId; side: Side; cause: DeathCause; x: number; z: number }
  | { type: 'buildingPlaced'; id: number; kind: BuildingId; side: Side }
  | { type: 'buildingDone'; id: number; kind: BuildingId; side: Side }
  | { type: 'buildingUpgraded'; id: number; kind: BuildingId; level: number }
  | { type: 'buildingDestroyed'; id: number; kind: BuildingId; side: Side; x: number; z: number }
  | { type: 'buildingEvolved'; id: number; from: BuildingId; to: BuildingId }
  | { type: 'cellsFlipped'; toNature: number; toHuman: number }
  | { type: 'collected'; value: number; by: 'tap' | 'pollinator'; x: number; z: number }
  | { type: 'eraUnlocked'; era: EraId }
  | { type: 'countermeasure'; cm: Countermeasure; name: string }
  | { type: 'defected'; id: CreatureId; count: number; domestic: DomesticId }
  | { type: 'captured'; kind: UnitId }
  | { type: 'strike'; bird: UnitId; x: number; z: number }
  | { type: 'skillBought'; id: string }
  | { type: 'active'; id: ActiveId }
  | { type: 'disasterWarning'; id: DisasterId; warn: number }
  | { type: 'disasterStarted'; id: DisasterId }
  | { type: 'disasterEnded'; id: DisasterId }
  | { type: 'runEnded'; result: RunResult }
  | { type: 'runStarted' }
  | { type: 'metaBought'; id: string; level: number }
  | { type: 'reset' };
